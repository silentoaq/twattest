import {
  deriveCredentialPda,
  deriveSchemaPda,
  getCreateCredentialInstruction,
  getCreateSchemaInstruction,
  fetchCredential,
  fetchSchema,
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

  const payerKey = process.env.PAYER_KEYPAIR!;
  const authorityKey = process.env.AUTHORITY_KEYPAIR!;

  const payer = await createKeyPairSignerFromPrivateKeyBytes(bs58.decode(payerKey).slice(0, 32));
  const authority = payerKey === authorityKey ?
    payer :
    await createKeyPairSignerFromPrivateKeyBytes(bs58.decode(authorityKey).slice(0, 32));

  console.log('設定 Credential 和 Schemas...');

  // 預先計算所有 PDA
  const [credentialPda] = await deriveCredentialPda({
    authority: authority.address,
    name: process.env.CREDENTIAL_NAME!
  });

  const [twfidoSchemaPda] = await deriveSchemaPda({
    credential: credentialPda,
    name: process.env.SCHEMA_NAME_TWFIDO!,
    version: parseInt(process.env.SCHEMA_VERSION_TWFIDO!)
  });

  const [twlandSchemaPda] = await deriveSchemaPda({
    credential: credentialPda,
    name: process.env.SCHEMA_NAME_TWLAND!,
    version: parseInt(process.env.SCHEMA_VERSION_TWLAND!)
  });

  console.log(`Credential PDA: ${credentialPda}`);
  console.log(`Twfido Schema PDA: ${twfidoSchemaPda}`);
  console.log(`Twland Schema PDA: ${twlandSchemaPda}`);

  // 定義 schema 結構
  const attestationSchema = {
    "merkle_root": 13,        // Vec<u8> - 32 bytes 的二進制數據
    "credential_reference": 12 // String - VC ID 字符串
  };

  // 步驟 1：創建 Credential（檢查是否已存在）
  try {
    console.log('步驟 1: 檢查並創建 Credential...');

    // 先檢查是否已存在
    const existingCredential = await fetchCredential(rpc, credentialPda).catch(() => null);

    if (existingCredential) {
      console.log('[跳過] Credential 已存在');
    } else {
      const credentialInput: CreateCredentialInput = {
        payer: payer,
        authority: authority,
        signers: [authority.address],
        credential: credentialPda,
        name: process.env.CREDENTIAL_NAME!
      };

      const { value: latestBlockhash1 } = await rpc.getLatestBlockhash().send();

      const transactionMessage1 = pipe(
        createTransactionMessage({ version: 0 }),
        tx => setTransactionMessageFeePayer(payer.address, tx),
        tx => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash1, tx),
        tx => appendTransactionMessageInstruction(getCreateCredentialInstruction(credentialInput), tx),
      );

      const signedTransaction1 = await signTransactionMessageWithSigners(transactionMessage1);
      const sendAndConfirm = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });

      await sendAndConfirm(signedTransaction1, {
        commitment: "confirmed",
        skipPreflight: true
      });

      const signature1 = getSignatureFromTransaction(signedTransaction1);
      console.log(`[成功] Credential 創建成功! 簽名: ${signature1}`);
    }

    // 等待交易確認
    await new Promise(resolve => setTimeout(resolve, 2000));

  } catch (error) {
    console.error('[錯誤] Credential 處理失敗:', error);
    return;
  }

  // 步驟 2：創建 Twfido Schema（檢查是否已存在）
  try {
    console.log('步驟 2: 檢查並創建 Twfido Schema...');

    // 先檢查是否已存在
    const existingTwfidoSchema = await fetchSchema(rpc, twfidoSchemaPda).catch(() => null);

    if (existingTwfidoSchema) {
      console.log('[跳過] Twfido Schema 已存在');
    } else {
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

      const { value: latestBlockhash2 } = await rpc.getLatestBlockhash().send();

      const transactionMessage2 = pipe(
        createTransactionMessage({ version: 0 }),
        tx => setTransactionMessageFeePayer(payer.address, tx),
        tx => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash2, tx),
        tx => appendTransactionMessageInstruction(getCreateSchemaInstruction(twfidoSchemaInput), tx),
      );

      const signedTransaction2 = await signTransactionMessageWithSigners(transactionMessage2);
      const sendAndConfirm2 = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });

      await sendAndConfirm2(signedTransaction2, {
        commitment: "confirmed",
        skipPreflight: true
      });

      const signature2 = getSignatureFromTransaction(signedTransaction2);
      console.log(`[成功] Twfido Schema 創建成功! 簽名: ${signature2}`);
    }

    // 等待交易確認
    await new Promise(resolve => setTimeout(resolve, 2000));

  } catch (error) {
    console.error('[錯誤] Twfido Schema 處理失敗:', error);
    return;
  }

  // 步驟 3：創建 Twland Schema（檢查是否已存在）
  try {
    console.log('步驟 3: 檢查並創建 Twland Schema...');

    // 先檢查是否已存在
    const existingTwlandSchema = await fetchSchema(rpc, twlandSchemaPda).catch(() => null);

    if (existingTwlandSchema) {
      console.log('[跳過] Twland Schema 已存在');
    } else {
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

      const { value: latestBlockhash3 } = await rpc.getLatestBlockhash().send();

      const transactionMessage3 = pipe(
        createTransactionMessage({ version: 0 }),
        tx => setTransactionMessageFeePayer(payer.address, tx),
        tx => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash3, tx),
        tx => appendTransactionMessageInstruction(getCreateSchemaInstruction(twlandSchemaInput), tx),
      );

      const signedTransaction3 = await signTransactionMessageWithSigners(transactionMessage3);
      const sendAndConfirm3 = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });

      await sendAndConfirm3(signedTransaction3, {
        commitment: "confirmed",
        skipPreflight: true
      });

      const signature3 = getSignatureFromTransaction(signedTransaction3);
      console.log(`[成功] Twland Schema 創建成功! 簽名: ${signature3}`);
    }

    console.log('\n所有設定完成！');
    console.log(`Credential PDA: ${credentialPda}`);
    console.log(`Twfido Schema PDA: ${twfidoSchemaPda}`);
    console.log(`Twland Schema PDA: ${twlandSchemaPda}`);

  } catch (error) {
    console.error('[錯誤] Twland Schema 處理失敗:', error);
    return;
  }
}

setupCredentialsAndSchemas().catch(console.error);