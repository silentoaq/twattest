import { TwattestVerifier } from '../dist/sdk/node.js';

// 初始化 Verifier
const verifier = new TwattestVerifier({
    apiSecret: 'test-secret-key',
    baseUrl: 'http://localhost:3001/api'
});

console.log('🧪 開始測試 TwattestSDK Node.js 版本\n');

// 測試 1: 檢查用戶權限
async function testCheckPermissions() {
    console.log('📋 測試 1: 檢查用戶權限');
    try {
        const testDid = 'did:pkh:sol:A3BE2TdV7vSpAK8qkgoiUUG6GTsWJCgtG46LvheQstjV';
        const permissions = await verifier.checkUserPermissions(testDid);
        console.log('✅ 權限查詢成功:', permissions);
    } catch (error) {
        console.log('❌ 權限查詢失敗:', error.message);
    }
    console.log('');
}

// 測試 2: 取得 Attestation 狀態
async function testAttestationStatus() {
    console.log('🔗 測試 2: 取得 Attestation 狀態');
    try {
        const testDid = 'did:pkh:sol:A3BE2TdV7vSpAK8qkgoiUUG6GTsWJCgtG46LvheQstjV';
        const status = await verifier.getAttestationStatus(testDid);
        console.log('✅ Attestation 狀態查詢成功:', status);
    } catch (error) {
        console.log('❌ Attestation 狀態查詢失敗:', error.message);
    }
    console.log('');
}

// 測試 3: 驗證 VP Token (模擬)
async function testVerifyVPToken() {
    console.log('🔐 測試 3: 驗證 VP Token');
    try {
        // 模擬 VP Token
        const mockVPToken = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJFUzI1NiJ9.test.token';
        const result = await verifier.verifyVPToken(mockVPToken);
        console.log('✅ VP Token 驗證結果:', result);
    } catch (error) {
        console.log('❌ VP Token 驗證失敗:', error.message);
    }
    console.log('');
}

// 測試 4: 提取憑證資料 (模擬)
async function testExtractCredentialData() {
    console.log('📊 測試 4: 提取憑證資料');
    try {
        const mockVPToken = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJFUzI1NiJ9.test.token';
        const schema = {
            name: 'string',
            address: 'string',
            land_area: 'string'
        };
        
        const result = await verifier.extractCredentialData(mockVPToken, schema);
        console.log('✅ 憑證資料提取結果:', result);
    } catch (error) {
        console.log('❌ 憑證資料提取失敗:', error.message);
    }
    console.log('');
}

// 執行所有測試
async function runAllTests() {
    console.log('🚀 TwattestSDK Node.js 測試開始\n');
    console.log('⚠️  注意: 需要先啟動 API 服務 (npm run dev:api)\n');
    
    await testCheckPermissions();
    await testAttestationStatus();
    await testVerifyVPToken();
    await testExtractCredentialData();
    
    console.log('✨ 測試完成');
}

// 檢查 API 服務是否運行
async function checkAPIService() {
    try {
        const response = await fetch('http://localhost:3001/health');
        if (response.ok) {
            console.log('✅ API 服務運行中\n');
            return true;
        }
    } catch (error) {
        console.log('❌ API 服務未運行，請先執行: npm run dev:api\n');
        return false;
    }
}

// 主函數
async function main() {
    const apiRunning = await checkAPIService();
    if (apiRunning) {
        await runAllTests();
    }
}

main().catch(console.error);