import {
  deriveCredentialPda,
  deriveSchemaPda,
  deriveAttestationPda,
  deriveEventAuthorityAddress,  // 加入這個
  getCloseAttestationInstruction,
  fetchAttestation,
  type CloseAttestationInput,
} from "sas-lib";
import {
  sendAndConfirmTransactionFactory,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  appendTransactionMessageInstruction,
  setTransactionMessageLifetimeUsingBlockhash,
  setTransactionMessageFeePayer,
  createTransactionMessage,
  pipe,
  getSignatureFromTransaction,
  address,
  type Address,
} from "@solana/kit";
import { createKeyPairSignerFromPrivateKeyBytes, signTransactionMessageWithSigners } from "@solana/signers";
import bs58 from "bs58";
import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

async function closeAttestation() {
  const rpc = createSolanaRpc(`https://${process.env.RPC_ROOT!}`);
  const rpcSubscriptions = createSolanaRpcSubscriptions(`wss://${process.env.RPC_ROOT!}`);
  const payerKey = process.env.PAYER_KEYPAIR!;
  const authorityKey = process.env.AUTHORITY_KEYPAIR!;
  const payer = await createKeyPairSignerFromPrivateKeyBytes(bs58.decode(payerKey).slice(0, 32));
  const authority = payerKey === authorityKey ?
    payer :
    await createKeyPairSignerFromPrivateKeyBytes(bs58.decode(authorityKey).slice(0, 32));
  
  const holderAddress = "C1NjDZ5QjxMY7PFk2icTNUyemdxu78jMkg41NbzYXzyN";
  const credentialReference = "urn:uuid:daa0a267-be74-4174-a57b-222397c1c801";
  
  const hash = crypto.createHash('sha256')
    .update(holderAddress + credentialReference)
    .digest();
  const nonce = bs58.encode(hash) as Address;
  
  try {
    const [credentialPda] = await deriveCredentialPda({
      authority: authority.address,
      name: process.env.CREDENTIAL_NAME!
    });
    const [twlandSchemaPda] = await deriveSchemaPda({
      credential: credentialPda,
      name: process.env.SCHEMA_NAME_TWLAND!,
      version: parseInt(process.env.SCHEMA_VERSION_TWLAND!)
    });
    const [attestationPda] = await deriveAttestationPda({
      credential: credentialPda,
      schema: twlandSchemaPda,
      nonce: nonce
    });
    
    const eventAuthority = await deriveEventAuthorityAddress();
    
    console.log('計算出的 Attestation PDA:', attestationPda);
    console.log('Event Authority:', eventAuthority);
    
    const closeInput: CloseAttestationInput = {
      payer: payer,
      authority: authority,
      credential: credentialPda,
      attestation: attestationPda,
      eventAuthority: eventAuthority,
      systemProgram: address('11111111111111111111111111111111'),
      attestationProgram: address(process.env.SAS_PROGRAM_ID!)
    };
    
    const closeIx = getCloseAttestationInstruction(closeInput);
    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
    const transactionMessage = pipe(
      createTransactionMessage({ version: 0 }),
      tx => setTransactionMessageFeePayer(payer.address, tx),
      tx => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
      tx => appendTransactionMessageInstruction(closeIx, tx),
    );
    const signedTransaction = await signTransactionMessageWithSigners(transactionMessage);
    const sendAndConfirm = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });
    await sendAndConfirm(signedTransaction, {
      commitment: "confirmed",
      skipPreflight: true
    });
    const signature = getSignatureFromTransaction(signedTransaction);
    console.log(`\n[成功] Twland Attestation 已關閉！`);
    console.log(`簽名: ${signature}`);
    console.log(`Attestation PDA: ${attestationPda}`);
    
  } catch (error) {
    console.error('\n[錯誤] 關閉 Attestation 失敗:', error);
    
    if (error instanceof Error && error.message.includes('custom program error')) {
      console.log('\n診斷資訊：');
      console.log('Authority:', authority.address);
      console.log('Credential PDA:', (await deriveCredentialPda({
        authority: authority.address,
        name: process.env.CREDENTIAL_NAME!
      }))[0]);
      console.log('Nonce:', nonce);
      console.log('Holder Address:', holderAddress);
      console.log('Credential Reference:', credentialReference);
    }
  }
}

closeAttestation().catch(console.error);