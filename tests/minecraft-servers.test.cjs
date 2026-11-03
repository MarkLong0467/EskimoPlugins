const fs=require('fs');const path=require('path');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
// ---- tiny React renderer with state per component path
let store=new Map(),cur,idx,effects=[],dirty=false;
const React={Component:class{},useState:i0=>{const c=cur;const i=idx++;if(!(i in c.s))c.s[i]=i0;return[c.s[i],v=>{c.s[i]=typeof v==='function'?v(c.s[i]):v;dirty=true}]},
 useEffect:(f,deps)=>{const c=cur;const i=idx++;if(!c.e[i]){c.e[i]={};effects.push(()=>{c.e[i].cleanup=f()})}},cloneElement:(e,p)=>({...e,props:{...e.props,...p}})};
const el=(type,props,key)=>({type,props:props||{},key});const runtime={jsx:(t,p,k)=>el(t,p,k),jsxs:(t,p,k)=>el(t,p,k)};
function render(node,path){if(Array.isArray(node))return node.map((n,i)=>render(n,path+'/'+i));if(!node||typeof node!=='object')return node;
 if(typeof node.type==='function'){const p=path+'/'+(node.key||node.type.name);let c=store.get(p);if(!c){c={s:{},e:{}};store.set(p,c)}const pc=cur,pi=idx;cur=c;idx=0;const out=(node.type.prototype&&node.type.prototype.render)?(()=>{const inst=new node.type(node.props);inst.props=node.props;return inst.render()})():node.type(node.props);cur=pc;idx=pi;return render(out,p)}
 const kids=node.props&&node.props.children;return{...node,props:{...node.props,children:kids===undefined?undefined:render(kids,path+'/'+(node.key||(typeof node.type==='string'?node.type:'x')))}}}
async function draw(root){let t;for(let n=0;n<5;n++){dirty=false;effects=[];t=render(root,'r');effects.forEach(f=>f());await sleep(5);if(!dirty)break}return t}
const walk=(n,f)=>{if(Array.isArray(n))return n.forEach(x=>walk(x,f));if(!n||typeof n!=='object')return;f(n);walk(n.props&&n.props.children,f)};
const texts=t=>{const o=[];walk(t,n=>{if(n.props&&typeof n.props.children==='string')o.push(n.props.children);if(n.props&&n.props.text)o.push('['+n.props.text+']')});return o};
const press=(t,text)=>{let hit;walk(t,n=>{if(!hit&&n.props&&n.props.text===text&&n.props.onPress)hit=n});if(!hit)throw new Error('no button '+text+' in '+texts(t).slice(0,30).join('|'));hit.props.onPress()};
const mk=n=>({__t:n});
// ---- fake network
const urls=[];let behaviour={};
global.AbortController=class{constructor(){this.signal={}}abort(){}};
global.fetch=async(u)=>{urls.push(u);const b=behaviour[Object.keys(behaviour).find(k=>u.includes(k))];if(!b)throw new Error('Network request failed');if(b==='reject')throw new Error('Network request failed');if(typeof b==='function')return b(u);return{ok:true,status:200,json:async()=>JSON.parse(JSON.stringify(b))}};
const online={online:true,host:'play.example.com',port:25565,ip_address:'203.0.113.7',version:{name_raw:'Paper 1.20.4',name_clean:'Paper 1.20.4',protocol:765},players:{online:12,max:100,list:[{uuid:'1',name_clean:'Steve'},{uuid:'2',name_clean:'Alex'}]},motd:{clean:'§aWelcome to Example!\nJoin us'},icon:'data:image/png;base64,AAAA',software:null,plugins:[{name:'EssentialsX',version:'2.20'}],mods:[]};
const mine={'api.mcstatus.io/v2/status/java':online,'api.minetools.eu':{description:'x',latency:34.4,players:{max:100,online:12,sample:[{id:'1',name:'Steve'}]},version:{name:'Paper 1.20.4',protocol:765}}};
const toasts=[];const sent=[];let clip='';
global.valenced={react:{React,ReactNative:{View:mk('View'),Pressable:mk('Pressable'),Image:mk('Image'),ScrollView:mk('Scroll'),useWindowDimensions:()=>({height:800})},ReactJSXRuntime:runtime},
 utils:{discord:{lookupGeneratedIconComponent:()=>undefined}},
 discord:{design:{Design:{Text:mk('Text'),Button:mk('Button'),TextInput:mk('Input'),TableRow:mk('Row'),TableRowGroup:mk('Group'),TableSwitchRow:mk('Switch'),TableRadioGroup:mk('Radio'),TableRadioRow:mk('RadioRow'),Stack:mk('Stack'),ActionSheet:mk('Sheet')}},
  actions:{ToastActionCreators:{open:(k,o)=>toasts.push(o.text)},ActionSheetActionCreators:{openLazy:(p,k)=>{p.then(m=>{lastSheet=m.default})},hideActionSheet(){}}},
  flux:{Stores:{SelectedChannelStore:{getChannelId:()=>'chan1'}}},common:{tokens:{Tokens:{default:{colors:{}}}}}},
 externals:{ReactNativeClipboard:{Clipboard:{setString:s=>{clip=s},getString:async()=>clip}}},
 patcher:{instead:(o,k,fn)=>{const orig=o[k];o[k]=function(...a){return fn.call(this,a,orig)};return()=>{o[k]=orig}}},
 modules:{finders:{filters:{withProps:(...n)=>n.join(),withName:n=>n},lookupModule:f=>f==='sendMessage,revealMessage'?[{sendMessage:(c,m)=>sent.push([c,m.content])}]:[],getModules:(f,cb)=>{if(f==='ChatInputGuardWrapper')cb(guardNs);return()=>{}}}}};
let lastSheet;global.plugin=d=>d;
const guardNs={default:()=>({type:'Guard',props:{children:[{type:valenced.react.ReactNative.View,props:{children:[{type:'Input',props:{}}]}}]}})};
const data={cache:{}};const json={get cache(){return data.cache},use(){return data.cache},set(p){Object.assign(data.cache,JSON.parse(JSON.stringify(p)));dirty=true}};
const p=new Function('valenced','plugin','return '+fs.readFileSync(path.join(__dirname,'..','plugins','minecraft-servers','index.js'),'utf8'))(valenced,plugin).default;
const out=(...a)=>console.log(...a);

let failed=0;const check=(n,ok,x)=>{console.log((ok?'ok   ':'FAIL ')+n+(ok||x===undefined?'':'  -> '+x));if(!ok)failed++};
// fake phone network: the web request to the server's own address closes after `closeAfter` ms
let closeAfter=160, phoneUrls=[], cleartext=false;
const baseFetch=global.fetch;
global.fetch=async(u,o)=>{
  if(/^https:\/\/(\d{1,3}(\.\d{1,3}){3}|[a-z0-9.-]+):\d+\/\?p=/.test(u)){
    phoneUrls.push(u);
    if(cleartext)throw new Error('Cleartext HTTP traffic not permitted');
    await sleep(closeAfter);throw new Error('Network request failed')
  }
  return baseFetch(u,o)
};
(async()=>{
 const atm={online:true,host:'atm10.baconetworks.com',port:25565,ip_address:'198.51.100.9',srv_record:{host:'play.baconetworks.com',port:25570},version:{name_raw:'NeoForge 1.21.1',name_clean:'NeoForge 1.21.1',protocol:767},players:{online:4,max:20,list:[]},motd:{clean:'x'},icon:null,mods:[]};
 behaviour={'api.mcstatus.io/v2/status/java':atm,'api.minetools.eu':{description:'x',latency:380.2,players:{max:20,online:4,sample:[]},version:{name:'NeoForge 1.21.1',protocol:767}}};
 p.start({cleanup:f=>f,jsonStorage:json});
 data.cache.pingSamples=3;data.cache.cacheSeconds=0;
 data.cache.serversJson=JSON.stringify([{id:'a1',name:'ATM10',address:'atm10.baconetworks.com',port:0,edition:'java'}]);
 const openList=async()=>{lastSheet=null;store=new Map();const st=await draw(el(p.SettingsComponent,{api:{jsonStorage:json}}));press(st,'Open the list');await sleep(5);return draw(el(lastSheet,{}))};

 // 1. the ping is measured from the phone, not taken from the status site (80 ms in the game, 380 ms from the site)
 closeAfter=160;
 let t=await openList();await sleep(900);t=await draw(el(lastSheet,{}));
 let tx=texts(t).join(' | ');
 check('the ping shown comes from the phone (160 ms close / 2 = 80 ms), not the site\'s 380 ms', /80 ms/.test(tx) && !/380 ms/.test(tx), tx.slice(0,300));
 check('the phone asks the real address behind the name (port from the SRV record)', phoneUrls.length>0 && phoneUrls.every(u=>u.indexOf('play.baconetworks.com:25570')>0), phoneUrls[0]);
 check('the first try is thrown away: 3 tries asks 4 times', phoneUrls.length===4, String(phoneUrls.length));

 // 3. the status site can still be chosen
 data.cache.pingSource='site'; phoneUrls=[];
 store=new Map();t=await openList();await sleep(100);t=await draw(el(lastSheet,{}));
 // force a fresh check
 await sleep(5);
 check('with the status site as the source the phone does not measure', phoneUrls.length===0, String(phoneUrls.length));
 data.cache.pingSource='phone';

 // 4. calibration changes the number
 data.cache.pingFactor=1; 
 data.cache.serversJson=JSON.stringify([{id:'b1',name:'B',address:'b.example.com',port:0,edition:'java'}]);
 closeAfter=120;
 t=await openList();await sleep(800);t=await draw(el(lastSheet,{}));
 check('a factor of 1 shows the whole time (about 120 ms)', /12\d ms/.test(texts(t).join(' | ')), texts(t).join(' | ').slice(0,200));
 data.cache.pingFactor=2;

 // 5. a phone that does not allow the check falls back to the site's ping, and says so
 cleartext=true;phoneUrls=[];
 data.cache.serversJson=JSON.stringify([{id:'c1',name:'C',address:'c.example.com',port:0,edition:'java'}]);
 t=await openList();await sleep(300);t=await draw(el(lastSheet,{}));
 check('if the phone refuses, the site\'s ping is shown instead', /380 ms/.test(texts(t).join(' | ')), texts(t).join(' | ').slice(0,200));
 cleartext=false;

 // 6. the detail view: buttons stay at the bottom, and delete works with two taps
 data.cache.serversJson=JSON.stringify([{id:'d1',name:'Del',address:'d.example.com',port:0,edition:'java'},{id:'d2',name:'Keep',address:'k.example.com',port:0,edition:'java'}]);
 closeAfter=100;
 t=await openList();await sleep(600);t=await draw(el(lastSheet,{}));
 let rowBtn;walk(t,n=>{if(!rowBtn&&n.type&&n.type.name==='ServerRow'&&n.props.server&&n.props.server.id==='d1')rowBtn=n});
 // open the detail through the menu route: long press is a Pressable inside; find by text
 let pr;walk(t,n=>{if(!pr&&n.props&&n.props.onPress&&n.props.onLongPress&&JSON.stringify(n.props.children||'').indexOf('Del')>=0)pr=n});
 pr.props.onPress();await sleep(20);t=await draw(el(lastSheet,{}));
 let sheet;walk(t,n=>{if(n.type&&n.type.__t==='Sheet'||n.type==='Sheet')sheet=n});
 const kids=sheet&&sheet.props.children;
 const scroll=Array.isArray(kids)?kids[0]:null; const footer=Array.isArray(kids)?kids[1]:null;
 check('the detail view has a scrolling part and a fixed footer', !!scroll&&!!footer);
 check('the scrolling part can scroll inside the sheet', scroll&&scroll.props.nestedScrollEnabled===true&&scroll.props.scrollEnabled===true&&scroll.props.style.maxHeight<=800*0.7, JSON.stringify(scroll&&scroll.props.style));
 check('the scrolling part plus the buttons fit on the screen (800 dp window)', scroll&&scroll.props.style.maxHeight+2*52+8+28+200<=800, JSON.stringify(scroll&&scroll.props.style));
 const ftxt=texts(footer).join('|');
 check('Refresh, Edit, Send to chat and Delete are in the footer', ['Refresh','Edit','Send to chat','Delete'].every(x=>ftxt.indexOf('['+x+']')>=0), ftxt);
 press(footer,'Delete');await sleep(5);
 check('the first tap on Delete only asks', JSON.parse(data.cache.serversJson).length===2 && toasts.slice(-1)[0]==='Tap again to delete Del', toasts.slice(-1)[0]);
 t=await draw(el(lastSheet,{}));walk(t,n=>{if(n.type&&n.type.__t==='Sheet'||n.type==='Sheet')sheet=n});
 const f2=Array.isArray(sheet.props.children)?sheet.props.children[1]:null;
 check('the button now says Tap again to delete', texts(f2).join('|').indexOf('[Tap again to delete]')>=0, texts(f2).join('|'));
 press(f2,'Tap again to delete');await sleep(10);
 const left=JSON.parse(data.cache.serversJson);
 check('the second tap deletes the server and keeps the others', left.length===1&&left[0].id==='d2', JSON.stringify(left.map(x=>x.id)));

 // 7. delete from the edit sheet too
 data.cache.serversJson=JSON.stringify([{id:'e1',name:'Edit me',address:'e.example.com',port:0,edition:'java'}]);
 lastSheet=null;store=new Map();let st=await draw(el(p.SettingsComponent,{api:{jsonStorage:json}}));
 check('the settings page lists a ping group and the calibration', texts(st).join('|').indexOf('Ping calibration')>=0 && texts(st).some(x=>/Calibrate/.test(x)), texts(st).filter(x=>/Calib|Ping/.test(x)).join('|'));

 // 8. live player count: the status site says 0, the server itself (minetools) says 3
 {
  const base={online:true,host:'live.example.com',port:25565,ip_address:'203.0.113.9',version:{name_raw:'Paper 1.21',name_clean:'Paper 1.21',protocol:767},players:{online:0,max:20,list:[]},motd:{clean:'Hi'},icon:null,retrieved_at:Date.now()-90000};
  const fake=[{uuid:'0',name_clean:'§5§l§m---={| §f§lServer§5§l§m|}=---'},{uuid:'f',name_clean:'§aLobby: §e0/100 players online'},{uuid:'g',name_clean:'Has Space'}];
  behaviour={'api.mcstatus.io/v2/status/java':base,'api.minetools.eu':{description:'x',latency:40,players:{max:20,online:3,sample:[{id:'0',name:'§5§l§m---={| §f§lServer§5§l§m|}=---'},{id:'1',name:'Steve'},{id:'f',name:'§aLobby: §e0/100 players online'},{id:'2',name:'Alex'},{id:'3',name:'Kai'},{id:'g',name:'Has Space'},{id:'1',name:'steve'}]},version:{name:'Paper 1.21',protocol:767}}};
  data.cache.serversJson=JSON.stringify([{id:'l1',name:'Live',address:'live.example.com',port:0,edition:'java'}]);
  data.cache.liveCounts=true;closeAfter=60;
  let t8=await openList();await sleep(500);t8=await draw(el(lastSheet,{}));
  check('the list shows the live count (3), not the status site\'s 0', /3\/20|3 \/ 20/.test(texts(t8).join('|')), texts(t8).join('|').slice(0,200));
  data.cache.liveCounts=false;
  t8=await openList();await sleep(500);t8=await draw(el(lastSheet,{}));
  check('with live counts off the status site\'s count is shown', /0\/20|0 \/ 20/.test(texts(t8).join('|')), texts(t8).join('|').slice(0,200));
  data.cache.liveCounts=true;
  // detail tabs
  let pr8;walk(t8,n=>{if(!pr8&&n.props&&n.props.onPress&&n.props.onLongPress)pr8=n});pr8.props.onPress();await sleep(20);
  let d8=await draw(el(lastSheet,{}));
  const tabBtn=(tree,label)=>{let hit;walk(tree,n=>{if(!hit&&n.props&&n.props.onPress&&!n.props.text&&JSON.stringify(n.props.children||'').indexOf(label)>=0)hit=n});return hit};
  check('the detail screen has four tabs', ['Overview','Players','Info','History'].every(l=>tabBtn(d8,l)), texts(d8).join('|').slice(0,200));
  tabBtn(d8,'Players').props.onPress();await sleep(10);d8=await draw(el(lastSheet,{}));
  check('the Players tab lists the names, and nothing else long', ['Steve','Alex','Kai'].every(n=>texts(d8).join('|').indexOf(n)>=0), texts(d8).join('|').slice(0,300));
  check('lines that are not player names are hidden', ['Lobby','§','Has Space'].every(x=>texts(d8).join('|').indexOf(x)<0), texts(d8).join('|').slice(0,400));
  check('the Players tab says how many lines were hidden', /3 lines the server puts in its player list are not player names/.test(texts(d8).join('|')), texts(d8).join('|').slice(0,500));
  check('the same name twice is shown once', (texts(d8).join('|').match(/Steve/gi)||[]).length===1, texts(d8).join('|').slice(0,400));
  check('the Players tab does not repeat the stat boxes', texts(d8).join('|').indexOf('SOFTWARE')<0, '');
  tabBtn(d8,'Info').props.onPress();await sleep(10);d8=await draw(el(lastSheet,{}));
  check('the Info tab shows the address and port', /IP ADDRESS/.test(texts(d8).join('|')) && /PORT/.test(texts(d8).join('|')), texts(d8).join('|').slice(0,200));
  tabBtn(d8,'History').props.onPress();await sleep(10);d8=await draw(el(lastSheet,{}));
  check('the History tab shows the history card', /History/.test(texts(d8).join('|')), texts(d8).join('|').slice(0,200));
  // the sheet's own scroll view is used when it exists, with the plain one as the fallback
  const kidsOfSheet=(tree)=>{let sh;walk(tree,n=>{if(n.type&&n.type.__t==='Sheet')sh=n});return sh&&sh.props.children};
  const first=kidsOfSheet(d8)&&kidsOfSheet(d8)[0];
  check('without the sheet\'s own scroll view the plain scroll view is used', first&&first.type&&first.type.__t==='Scroll', first&&JSON.stringify(first.type&&first.type.__t||first.type));
  // a fresh copy of the plugin, with a sheet scroll view available: it is used, inside a safety net that falls back to the plain one
  global.valenced.discord.design.Design.BottomSheetScrollView=mk('SheetScroll');
  const p2=new Function('valenced','plugin','return '+fs.readFileSync(path.join(__dirname,'..','plugins','minecraft-servers','index.js'),'utf8'))(valenced,plugin).default;
  p2.start({cleanup:f=>f,jsonStorage:json});
  lastSheet=null;store=new Map();const st2=await draw(el(p2.SettingsComponent,{api:{jsonStorage:json}}));press(st2,'Open the list');await sleep(5);
  const d9=await draw(el(lastSheet,{}));
  const f9=kidsOfSheet(d9)&&kidsOfSheet(d9)[0];
  check('with the sheet\'s own scroll view the panel uses it (inside a safety net)', f9&&f9.type&&f9.type.__t==='SheetScroll', JSON.stringify(f9&&f9.type&&(f9.type.__t||f9.type.name)));
  delete global.valenced.discord.design.Design.BottomSheetScrollView;
 }
 // 9. the status sites say offline
 {
  const mkOff=(ip)=>({online:false,host:'down.example.com',port:25297,ip_address:ip,version:null,players:{online:0,max:0,list:[]},motd:{clean:''},icon:null});
  data.cache.serversJson=JSON.stringify([{id:'o1',name:'Odd',address:'down.example.com',port:25297,edition:'java'}]);
  data.cache.liveCounts=true;closeAfter=60;phoneUrls=[];
  // a) every site says offline, the phone can reach the address
  behaviour={'api.mcstatus.io/v2/status/java':mkOff('203.0.113.50')};
  let t9=await openList();await sleep(700);t9=await draw(el(lastSheet,{}));
  check('offline for the sites but reachable from the phone: shown as Reachable, not Offline', /Reachable/.test(texts(t9).join('|')) && !/Offline/.test(texts(t9).join('|')), texts(t9).join('|').slice(0,260));
  const mine=phoneUrls.filter(u=>/:25297\//.test(u));
  check('the phone probed the IP address itself, not the name', mine.length>0 && mine.every(u=>u.indexOf('203.0.113.50:25297')>0), mine.join(' '));
  // b) one site says offline but another says online
  behaviour={'api.mcstatus.io/v2/status/java':mkOff('203.0.113.50'),'api.minetools.eu':{description:'x',latency:40,players:{max:20,online:2,sample:[{id:'1',name:'Steve'}]},version:{name:'Paper 1.21',protocol:767}}};
  t9=await openList();await sleep(700);t9=await draw(el(lastSheet,{}));
  check('if another site sees it online, it is online', /Online|2\/20/.test(texts(t9).join('|')) && !/Offline|Reachable/.test(texts(t9).join('|')), texts(t9).join('|').slice(0,260));
  // c) no IP to probe: nothing is guessed
  behaviour={'api.mcstatus.io/v2/status/java':mkOff('')};
  phoneUrls=[];
  t9=await openList();await sleep(500);t9=await draw(el(lastSheet,{}));
  check('without an IP address to try, the server is simply Offline', /Offline/.test(texts(t9).join('|')) && phoneUrls.length===0, texts(t9).join('|').slice(0,260)+' '+phoneUrls.length);
  // d) the panels refresh by themselves by default
  lastSheet=null;store=new Map();const st9=await draw(el(p.SettingsComponent,{api:{jsonStorage:json}}));
  let hasRefresh=false;walk(st9,n=>{if(n.props&&n.props.title==='While a panel is open')hasRefresh=true});
  check('the settings offer automatic refresh for open panels', hasRefresh);
 }
 console.log(failed?'\n'+failed+' check(s) failed':'\nAll checks passed');process.exit(failed?1:0)
})();
