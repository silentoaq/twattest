import {
  deriveCredentialPda,
  deriveSchemaPda,
  getCreateCredentialInstruction,
  getCreateSchemaInstruction,
  type CreateCredentialInput,
  type CreateSchemaInput,
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
} from "@solana/kit";
import { createKeyPairSignerFromPrivateKeyBytes, signTransactionMessageWithSigners } from "@solana/signers";
import bs58 from "bs58";
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

async function setupCredentialsAndSchemas() {
  const rpc = createSolanaRpc(`https://${process.env.RPC_ROOT!}`);
  const rpcSubscriptions = createSolanaRpcSubscriptions(`wss://${process.env.RPC_ROOT!}`);

  const payer = await createKeyPairSignerFromPrivateKeyBytes(bs58.decode(process.env.PAYER_KEYPAIR!));
  const authority = await createKeyPairSignerFromPrivateKeyBytes(bs58.decode(process.env.AUTHORITY_KEYPAIR!));

  console.log('設定 Credential 和 Schemas...');

  // 1. 創建 Credential
  const [credentialPda] = await deriveCredentialPda({
    authority: authority.address,
    name: process.env.CREDENTIAL_NAME!
  });

  console.log(`Credential PDA: ${credentialPda}`);

  const credentialInput: CreateCredentialInput = {
    payer: payer,
    authority: authority,
    signers: [authority.address],
    credential: credentialPda,
    name: process.env.CREDENTIAL_NAME!
  };

  // 2. 創建 Twfido Schema
  const [twfidoSchemaPda] = await deriveSchemaPda({
    credential: credentialPda,
    name: process.env.SCHEMA_NAME_TWFIDO!,
    version: parseInt(process.env.SCHEMA_VERSION_TWFIDO!)
  });

  console.log(`Twfido Schema PDA: ${twfidoSchemaPda}`);

  const attestationSchema = {
    merkle_root: 32,  // 32 bytes for merkle root
    credential_reference: 64,  // Variable length, max 64 bytes for reference
  };

  const twfidoSchemaInput: CreateSchemaInput = {
    payer: payer,
    authority: authority,
    credential: credentialPda,
    schema: twfidoSchemaPda,
    name: process.env.SCHEMA_NAME_TWFIDO!,
    description: process.env.SCHEMA_DESCRIPTION_TWFIDO!,
    layout: new Uint8Array(Object.values(attestationSchema)),
    fieldNames: Object.keys(attestationSchema),
  };

  // 3. 創建 Twland Schema
  const [twlandSchemaPda] = await deriveSchemaPda({
    credential: credentialPda,
    name: process.env.SCHEMA_NAME_TWLAND!,
    version: parseInt(process.env.SCHEMA_VERSION_TWLAND!)
  });

  console.log(`Twland Schema PDA: ${twlandSchemaPda}`);

  const twlandSchemaInput: CreateSchemaInput = {
    payer: payer,
    authority: authority,
    credential: credentialPda,
    schema: twlandSchemaPda,
    name: process.env.SCHEMA_NAME_TWLAND!,
    description: process.env.SCHEMA_DESCRIPTION_TWLAND!,
    layout: new Uint8Array(Object.values(attestationSchema)),
    fieldNames: Object.keys(attestationSchema),
  };

  try {
    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

    // 創建包含所有指令的交易
    const transactionMessage = pipe(
      createTransactionMessage({ version: 0 }),
      tx => setTransactionMessageFeePayer(payer.address, tx),
      tx => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
      tx => appendTransactionMessageInstruction(getCreateCredentialInstruction(credentialInput), tx),
      tx => appendTransactionMessageInstruction(getCreateSchemaInstruction(twfidoSchemaInput), tx),
      tx => appendTransactionMessageInstruction(getCreateSchemaInstruction(twlandSchemaInput), tx),
    );

    const signedTransaction = await signTransactionMessageWithSigners(transactionMessage);
    const sendAndConfirm = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });

    await sendAndConfirm(signedTransaction, {
      commitment: "confirmed",
      skipPreflight: true
    });

    const signature = getSignatureFromTransaction(signedTransaction);
    
    console.log('設定完成成功！');
    console.log(`交易簽名: ${signature}`);
    console.log(`Credential PDA: ${credentialPda}`);
    console.log(`Twfido Schema PDA: ${twfidoSchemaPda}`);
    console.log(`Twland Schema PDA: ${twlandSchemaPda}`);

  } catch (error) {
    console.error('設定失敗:', error);
    throw error;
  }
}

setupCredentialsAndSchemas().catch(console.error);