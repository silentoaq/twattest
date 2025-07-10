import fs from 'fs';

// 檢查檔案是否存在
const filePath = '../shared/constants.ts';
if (fs.existsSync(filePath)) {
    console.log('File exists');
    const content = fs.readFileSync(filePath, 'utf8');
    console.log('File content:', content);
} else {
    console.log('File does not exist');
}

// 嘗試動態匯入
try {
    const module = await import('../shared/constants.js');
    console.log('Available exports:', Object.keys(module));
    console.log('SCHEMA_NAMES:', module.SCHEMA_NAMES);
} catch (error) {
    console.error('Import error:', error.message);
}