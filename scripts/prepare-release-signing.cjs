/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const privateFile=path.join(root,'.data/release-signing/update-private.dpapi');
const publicFile=path.join(root,'packaging/update-public-key.pem');
function protect(bytes,unprotect=false) {
 const operation=unprotect?'Unprotect':'Protect';
 const script=`Add-Type -AssemblyName System.Security; $bytes=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $result=[System.Security.Cryptography.ProtectedData]::${operation}($bytes,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Write([Convert]::ToBase64String($result))`;
 return Buffer.from(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{input:bytes.toString('base64'),encoding:'utf8',windowsHide:true}).trim(),'base64');
}
function loadSigningKey() {
 const plain=protect(fs.readFileSync(privateFile),true);
 try{return crypto.createPrivateKey({key:plain,format:'der',type:'pkcs8'});}finally{plain.fill(0);}
}
function prepareSigningKey() {
 if(!fs.existsSync(privateFile)) {
  if(fs.existsSync(publicFile))throw Error('已有公钥但签名私钥缺失，请恢复私钥，不可自动换钥');
  fs.mkdirSync(path.dirname(privateFile),{recursive:true});
  const keys=crypto.generateKeyPairSync('ed25519');
  const bytes=keys.privateKey.export({format:'der',type:'pkcs8'});
  try{fs.writeFileSync(privateFile,protect(bytes),{flag:'wx'});}finally{bytes.fill(0);}
  fs.writeFileSync(publicFile,keys.publicKey.export({format:'pem',type:'spki'}),{flag:'wx'});
 }
 const expected=crypto.createPublicKey(loadSigningKey()).export({format:'pem',type:'spki'});
 if(fs.readFileSync(publicFile,'utf8')!==expected)throw Error('更新公私钥不匹配');
 console.log('更新签名已配置；私钥仅保存在本机，使用当前Windows账户加密。');
}
module.exports={prepareSigningKey,loadSigningKey};
if(require.main===module)prepareSigningKey();
