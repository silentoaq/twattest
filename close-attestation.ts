import {
  deriveCredentialPda,
  deriveSchemaPda,
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

  const attestationToClose = address('2eTUYqdTUDXgmjU23wDHHVX74QJjGcicWXTbA8FCLX9P');

  console.log('準備關閉 Twland (房產憑證) Attestation...');
  console.log(`Attestation 地址: ${attestationToClose}`);
  console.log(`使用 Authority: ${authority.address}`);

  try {
    const attestation = await fetchAttestation(rpc, attestationToClose);
    console.log('\nAttestation 詳情:');
    console.log(`- Credential: ${attestation.data.credential}`);
    console.log(`- Schema: ${attestation.data.schema}`);
    console.log(`- Expiry: ${attestation.data.expiry}`);
    console.log(`- Data length: ${attestation.data.data.length} bytes`);

    const [credentialPda] = await deriveCredentialPda({
      authority: authority.address,
      name: process.env.CREDENTIAL_NAME!
    });

    const [twlandSchemaPda] = await deriveSchemaPda({
      credential: credentialPda,
      name: process.env.SCHEMA_NAME_TWLAND!,
      version: parseInt(process.env.SCHEMA_VERSION_TWLAND!)
    });

    console.log(`\n使用 Credential PDA: ${credentialPda}`);
    console.log(`預期的 Twland Schema PDA: ${twlandSchemaPda}`);
    console.log(`實際的 Schema PDA: ${attestation.data.schema}`);
    
    if (attestation.data.schema !== twlandSchemaPda) {
      console.warn('\n警告：Schema PDA 不匹配！');
      console.log('這可能不是 Twland attestation，或使用了不同的 schema version');
    }

    console.log(`Program ID: ${process.env.SAS_PROGRAM_ID}`);

    const closeInput: CloseAttestationInput = {
      payer: payer,
      authority: authority,
      credential: credentialPda,
      attestation: attestationToClose,
      eventAuthority: authority.address,
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
    console.log(`租金已退還給: ${authority.address}`);

  } catch (error) {
    console.error('\n[錯誤] 關閉 Attestation 失敗:', error);
    if (error instanceof Error) {
      console.error('錯誤詳情:', error.message);
      if (error.message.includes('custom program error: #7')) {
        console.error('\n錯誤 #7 通常表示：');
        console.error('1. 您不是這個 attestation 的創建者');
        console.error('2. Attestation 屬於不同的 credential/schema');
        console.error('3. 權限不匹配');
        
        console.error('\n請確認：');
        console.error('- 這個 attestation 是由您的 authority 創建的');
        console.error('- 使用正確的 schema (Twland vs Twfido)');
      }
    }
  }
}

closeAttestation().catch(console.error);