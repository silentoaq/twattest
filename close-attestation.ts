import {
  deriveCredentialPda,
  deriveSchemaPda,
  deriveAttestationPda,
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
  
  // 原始資料
  const holderAddress = "C1NjDZ5QjxMY7PFk2icTNUyemdxu78jMkg41NbzYXzyN";
  const credentialReference = "urn:uuid:daa0a267-be74-4174-a57b-222397c1c801";
  
  // 計算 nonce
  const hash = crypto.createHash('sha256')
    .update(holderAddress + credentialReference)
    .digest();
  const nonce = bs58.encode(hash) as Address;
  
  try {
    // 取得 PDAs
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
    
    console.log('計算出的 Attestation PDA:', attestationPda);
    
    // 讀取並顯示 attestation 的完整數據
    try {
      const attestationData = await fetchAttestation(rpc, attestationPda);
      
      console.log('\n=== Attestation 資料 ===');
      console.log('attestationData 物件:', attestationData);
      
      // 使用 console.dir 來顯示完整結構
      console.log('\n=== 使用 console.dir 顯示完整結構 ===');
      console.dir(attestationData, { depth: null });
      
      // 顯示頂層欄位
      console.log('\n=== 頂層欄位名稱 ===');
      console.log(Object.keys(attestationData));
      
      // 檢查並顯示 data 欄位
      if ('data' in attestationData) {
        console.log('\n=== data 欄位 ===');
        console.log(attestationData.data);
        
        // 顯示 data 的所有欄位
        console.log('\n=== data 的欄位名稱 ===');
        console.log(Object.keys(attestationData.data));
        
        // 手動檢查每個欄位
        for (const [key, value] of Object.entries(attestationData.data)) {
          console.log(`${key}:`, typeof value === 'bigint' ? value.toString() : value);
        }
      }
      
      // 確認 attestation 確實存在於這個地址
      console.log('\n=== 確認 ===');
      console.log('Attestation 確實存在於地址:', attestationPda);
      
    } catch (fetchError) {
      console.error('無法讀取 Attestation:', fetchError);
      console.log('錯誤詳情:', fetchError);
      return;
    }
    
    // 嘗試不同的 eventAuthority 值
    console.log('\n=== 嘗試關閉 Attestation ===');
    
    // 嘗試 1: 使用 authority.address
    console.log('嘗試 eventAuthority = authority.address:', authority.address);
    
    const closeInput: CloseAttestationInput = {
      payer: payer,
      authority: authority,
      credential: credentialPda,
      attestation: attestationPda,
      eventAuthority: address('8bdpHv6uU91DZ1oExc52WWRkx9MyQQiz6rFqyX98Vhx2'),  // 可以根據上面的數據調整
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
    
  } catch (error) {
    console.error('\n[錯誤] 關閉 Attestation 失敗:', error);
    
    // 如果失敗，建議嘗試其他 eventAuthority 值
    console.log('\n=== 建議嘗試的其他 eventAuthority 值 ===');
    console.log('1. credentialPda:', (await deriveCredentialPda({
      authority: authority.address,
      name: process.env.CREDENTIAL_NAME!
    }))[0]);
    console.log('2. 程式 ID:', process.env.SAS_PROGRAM_ID);
    console.log('3. 或查看上面印出的 attestation 數據中的相關欄位');
  }
}

closeAttestation().catch(console.error);