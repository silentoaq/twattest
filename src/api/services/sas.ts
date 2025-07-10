import {
    createSolanaRpc,
    createSolanaRpcSubscriptions,
    createTransactionMessage,
    pipe,
    setTransactionMessageFeePayer,
    setTransactionMessageLifetimeUsingBlockhash,
    appendTransactionMessageInstruction,
    getSignatureFromTransaction,
    sendAndConfirmTransactionFactory,
    type Address,
    type Rpc,
    type SolanaRpcApi,
    type RpcSubscriptions,
    type SolanaRpcSubscriptionsApi,
    ReadonlyUint8Array
} from '@solana/kit';
import { createKeyPairSignerFromPrivateKeyBytes, signTransactionMessageWithSigners } from '@solana/signers';
import {
    deriveCredentialPda,
    deriveSchemaPda,
    deriveAttestationPda,
    getCreateAttestationInstruction,
    fetchAttestation,
    type CreateAttestationInput
} from 'sas-lib';
import bs58 from 'bs58';
import { SDJWTVerificationResult, AttestationData, SUPPORTED_ISSUERS } from '../types.js';



type RpcClient = {
    rpc: Rpc<SolanaRpcApi>;
    rpcSubscriptions: RpcSubscriptions<SolanaRpcSubscriptionsApi>;
};

const createSolanaClient = (): RpcClient => {
    const rpc = createSolanaRpc(`https://${process.env.RPC_ROOT!}`);
    const rpcSubscriptions = createSolanaRpcSubscriptions(`wss://${process.env.RPC_ROOT!}`);
    return { rpc, rpcSubscriptions };
};

let authorityKeypair: any = null;
let payerKeypair: any = null;

async function getKeypairs() {
    if (!payerKeypair) {
        const keyBytes = bs58.decode(process.env.PAYER_KEYPAIR!);
        payerKeypair = await createKeyPairSignerFromPrivateKeyBytes(
            keyBytes.slice(0, 32)
        );
    }

    if (!authorityKeypair) {
        if (process.env.AUTHORITY_KEYPAIR === process.env.PAYER_KEYPAIR) {
            authorityKeypair = payerKeypair;
        } else {
            const keyBytes = bs58.decode(process.env.AUTHORITY_KEYPAIR!);
            authorityKeypair = await createKeyPairSignerFromPrivateKeyBytes(
                keyBytes.slice(0, 32)
            );
        }
    }

    return { authorityKeypair, payerKeypair };
}

export async function createAttestation(verificationResult: SDJWTVerificationResult): Promise<string> {
    try {
        const { rpc, rpcSubscriptions } = createSolanaClient();
        const { authorityKeypair, payerKeypair } = await getKeypairs();

        const schemaInfo = getSchemaInfo(verificationResult.issuerDid);
        if (!schemaInfo) {
            throw new Error(`Unsupported issuer: ${verificationResult.issuerDid}`);
        }

        const [credentialPda] = await deriveCredentialPda({
            authority: authorityKeypair.address,
            name: process.env.CREDENTIAL_NAME!
        });

        const [schemaPda] = await deriveSchemaPda({
            credential: credentialPda,
            name: schemaInfo.name,
            version: schemaInfo.version
        });

        const holderAddress = verificationResult.holderDid.replace('did:pkh:sol:', '') as Address;

        const [attestationPda] = await deriveAttestationPda({
            credential: credentialPda,
            schema: schemaPda,
            nonce: holderAddress
        });

        console.log('Using Program ID:', process.env.SAS_PROGRAM_ID);
        console.log('Authority address:', authorityKeypair.address);
        console.log('Payer address:', payerKeypair.address);
        console.log('Holder address:', holderAddress);
        console.log('Credential PDA:', credentialPda);
        console.log('Schema PDA:', schemaPda);
        console.log('Attestation PDA:', attestationPda);

        const existingAttestation = await fetchAttestation(rpc, attestationPda).catch(() => null);
        if (existingAttestation) {
            console.log('Attestation already exists for this holder');
            return 'exists';
        }

        const attestationData = serializeAttestationData({
            merkleRoot: verificationResult.merkleRoot,
            credentialReference: verificationResult.credentialReference
        });

        const attestationInput: CreateAttestationInput = {
            payer: payerKeypair,
            authority: authorityKeypair,
            credential: credentialPda,
            schema: schemaPda,
            nonce: holderAddress,
            expiry: verificationResult.expiry,
            data: attestationData,
            attestation: attestationPda
        };

        const attestationIx = getCreateAttestationInstruction(attestationInput);

        const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

        const transactionMessage = pipe(
            createTransactionMessage({ version: 0 }),
            tx => setTransactionMessageFeePayer(payerKeypair.address, tx),
            tx => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
            tx => appendTransactionMessageInstruction(attestationIx, tx)
        );

        const signedTransaction = await signTransactionMessageWithSigners(transactionMessage);
        const sendAndConfirm = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });

        await sendAndConfirm(signedTransaction, {
            commitment: "confirmed",
            skipPreflight: true
        });

        const signature = getSignatureFromTransaction(signedTransaction);
        console.log(`Attestation created with signature: ${signature}`);

        return signature;
    } catch (error) {
        console.error('Error creating attestation:', error);
        throw error;
    }
}

export async function getAttestationStatus(holderDid: string): Promise<any> {
    try {
        const { rpc } = createSolanaClient();
        const { authorityKeypair } = await getKeypairs();

        const [credentialPda] = await deriveCredentialPda({
            authority: authorityKeypair.address,
            name: process.env.CREDENTIAL_NAME!
        });

        const holderAddress = holderDid.replace('did:pkh:sol:', '') as Address;
        const results: any = {};

        for (const [issuerKey, issuerDid] of Object.entries(SUPPORTED_ISSUERS)) {
            const schemaInfo = getSchemaInfo(issuerDid);
            if (!schemaInfo) continue;

            const [schemaPda] = await deriveSchemaPda({
                credential: credentialPda,
                name: schemaInfo.name,
                version: schemaInfo.version
            });

            const [attestationPda] = await deriveAttestationPda({
                credential: credentialPda,
                schema: schemaPda,
                nonce: holderAddress
            });

            try {
                const attestation = await fetchAttestation(rpc, attestationPda);
                results[issuerKey.toLowerCase()] = {
                    exists: !!attestation,
                    address: attestationPda,
                    data: attestation ? deserializeAttestationData(attestation.data.data) : null,
                    expiry: attestation ? Number(attestation.data.expiry) : null
                };
            } catch {
                results[issuerKey.toLowerCase()] = {
                    exists: false,
                    address: attestationPda,
                    data: null,
                    expiry: null
                };
            }
        }

        return results;
    } catch (error) {
        console.error('Error getting attestation status:', error);
        throw error;
    }
}

function getSchemaInfo(issuerDid: string): { name: string; version: number } | null {
    switch (issuerDid) {
        case SUPPORTED_ISSUERS.TWFIDO:
            return {
                name: process.env.SCHEMA_NAME_TWFIDO!,
                version: parseInt(process.env.SCHEMA_VERSION_TWFIDO!) || 1
            };
        case SUPPORTED_ISSUERS.TWLAND:
            return {
                name: process.env.SCHEMA_NAME_TWLAND!,
                version: parseInt(process.env.SCHEMA_VERSION_TWLAND!) || 1
            };
        default:
            return null;
    }
}

function serializeAttestationData(data: AttestationData): Uint8Array {
    // merkle_root: Vec<u8> 格式 - 長度前綴 + 數據
    const merkleRootBytes = Buffer.from(data.merkleRoot, 'hex');
    const merkleRootLength = Buffer.allocUnsafe(4);
    merkleRootLength.writeUInt32LE(merkleRootBytes.length, 0);

    // credential_reference: String 格式 - 長度前綴 + UTF-8 數據  
    const credentialRefBytes = Buffer.from(data.credentialReference, 'utf8');
    const credentialRefLength = Buffer.allocUnsafe(4);
    credentialRefLength.writeUInt32LE(credentialRefBytes.length, 0);

    return new Uint8Array(Buffer.concat([
        merkleRootLength, merkleRootBytes,
        credentialRefLength, credentialRefBytes
    ]));
}

function deserializeAttestationData(data: Uint8Array | ReadonlyUint8Array): AttestationData {
    const buffer = Buffer.from(data as Uint8Array);
    let offset = 0;

    // 讀取 merkle_root (Vec<u8> 格式)
    const merkleRootLength = buffer.readUInt32LE(offset);
    offset += 4;
    const merkleRootBytes = buffer.slice(offset, offset + merkleRootLength);
    const merkleRoot = merkleRootBytes.toString('hex');
    offset += merkleRootLength;

    // 讀取 credential_reference (String 格式)
    const credentialRefLength = buffer.readUInt32LE(offset);
    offset += 4;
    const credentialRefBytes = buffer.slice(offset, offset + credentialRefLength);
    const credentialReference = credentialRefBytes.toString('utf8');

    return {
        merkleRoot,
        credentialReference
    };
}