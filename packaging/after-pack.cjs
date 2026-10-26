/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
module.exports=async function(context){
 const root=path.resolve(__dirname,'..');
 const target=path.resolve(context.appOutDir);
 const allowed=path.join(root,'.release','installer')+path.sep;
 if(!target.toLowerCase().startsWith(allowed.toLowerCase()))throw Error('安装构建输出目录越界');
 for(const relative of ['node_modules','.next/node_modules']){
  const source=path.join(root,'.data','installer-runtime',relative);
  const destination=path.join(target,'_internal',relative);
  fs.mkdirSync(destination,{recursive:true});
  try{execFileSync('robocopy.exe',[source,destination,'/E','/XJ','/NFL','/NDL','/NJH','/NJS','/NP','/R:2','/W:1'],{stdio:'ignore',windowsHide:true});}
  catch(error){if(typeof error.status!=='number'||error.status>=8)throw error;}
 }
 for(const relative of ['node_modules/tsx/dist/cli.mjs','node_modules/better-sqlite3/prebuilds/win32-x64.node','node_modules/.remotion/chrome-headless-shell','assets/music','remotion-bundle/index.html']){
  if(!fs.existsSync(path.join(target,'_internal',relative)))throw Error('安装程序缺少运行资源：'+relative);
 }
 execFileSync(path.join(target,'_internal/runtime/node.exe'),['-e',"const Database=require(process.argv[1]);const db=new Database(':memory:');db.prepare('SELECT 1').get();db.close();",path.join(target,'_internal/node_modules/better-sqlite3')],{stdio:'pipe',windowsHide:true});
 console.log('已验证安装版Node、数据库、浏览器与音乐运行资源。');
};
