'use strict';
const assert = require('node:assert/strict');
function fake() { const gradient={addColorStop(){}}; return new Proxy({}, {get(t,p){ if(p==='measureText') return x=>({width:String(x||'').length*7}); if(p==='createLinearGradient'||p==='createRadialGradient') return ()=>gradient; if(!t[p]) t[p]=()=>{}; return t[p]; }}); }
global.wx={getSystemInfoSync:()=>({windowWidth:375,windowHeight:667,pixelRatio:1}),createCanvas:()=>({width:375,height:667,getContext:()=>fake()}),createImage:()=>({loaded:true,set src(v){this._src=v;if(this.onload)this.onload()}}),getStorageSync:()=>null,setStorageSync(){},onTouchStart(){},onTouchMove(){},onTouchEnd(){},onTouchCancel(){},onKeyboardConfirm(){},onAppHide(){},onAppShow(){},showToast(){}};
const {Game}=require('../js/game'); const {createCharacter}=require('../js/storage');
function make(){const g=new Game();g.stopLoop();g.render=()=>{};g.state=createCharacter(null,'单步巡护回归');g.state.world.reserve.fund=10000;g.state.world.reserve.supplies={dogFood:10,alarm:10,fieldKit:10,tranquilizer:10,medicalKit:10,evidenceTrap:2};g.screen='home';return g;}
for (const id of ['houndScout','antiPoacher','habitat','intervention']) {
 const g=make(); assert(g.openPatrolOperationScreen(id)); assert.equal(g.patrolTaskModal.id,id);
 const before=g.state.world.reserve.progression.totalActions;
 const beforeFund=g.state.world.reserve.fund;
 const beforeWater=g.state.world.reserve.ecology.water;
 const beforeGrass=g.state.world.reserve.ecology.grass;
 const buttons=[]; g.modalButton=(_c,_x,_y,_w,_h,label,_f,onTap)=>buttons.push({label,onTap}); g.drawPatrolTaskModal();
 assert(!buttons.some(b=>/规划路线|路线出发|选择节点/.test(b.label)));
 const execute=buttons.find(b=>/执行/.test(b.label)); assert(execute,id+': direct execute button missing'); execute.onTap();
 assert(g.settlementModal,id+': direct execute did not settle'); assert.equal(g.state.world.reserve.progression.totalActions,before+1);
 const after=JSON.stringify(g.state.world.reserve); execute.onTap(); assert.equal(JSON.stringify(g.state.world.reserve),after,id+': second tap changed saved state');
 const modal=g.settlementModal;
 const savedScreen=g.screen; g.screen='action';
 const frozen=g.reserveDynamicTargets(g.state.world.reserve);
 g.screen=savedScreen;
 assert.equal(frozen.fund,modal.pendingDisplayBefore.fund,id+': fund must remain at pre-task value until result confirmation');
 assert.equal(frozen.water,modal.pendingDisplayBefore.ecology.water,id+': water must remain at pre-task value until result confirmation');
 assert.equal(frozen.grass,modal.pendingDisplayBefore.ecology.grass,id+': grass must remain at pre-task value until result confirmation');
 assert.equal(modal.silent,false,id+': result must be visible even without a breakthrough');
 assert.equal(modal.autoFinishAt,undefined,id+': result must not close automatically');
 const oldNow=Date.now;
 try {
   Date.now=()=>modal.revealAt+10000;
   buttons.length=0; g.drawSettlementModal();
   assert.equal(g.settlementModal,modal,id+': result disappeared without confirmation');
   assert(modal.renderedSettlementStyle,id+': settlement was never drawn');
   assert(modal.stats.some(item=>item.key==='water') && modal.stats.some(item=>item.key==='fund'),id+': resource results missing');
   const close=buttons.find(b=>b.label==='关闭'); assert(close,id+': result close button missing');
   close.onTap(); assert.equal(g.settlementModal,null,id+': acknowledgement did not release task');
   const savedAfterScreen=g.screen; g.screen='action';
   const released=g.reserveDynamicTargets(g.state.world.reserve);
   g.screen=savedAfterScreen;
   assert.equal(released.fund,g.state.world.reserve.fund,id+': fund did not refresh after acknowledgement');
   assert.equal(released.water,g.state.world.reserve.ecology.water,id+': water did not refresh after acknowledgement');
   assert.equal(released.grass,g.state.world.reserve.ecology.grass,id+': grass did not refresh after acknowledgement');
   assert.equal(g.state.world.reserve.progression.totalActions,before+1,id+': acknowledgement reran task');
 } finally { Date.now=oldNow; }

}
const board=make(); board.drawPatrolExecuteBoard=board.drawPatrolExecuteBoard.bind(board); board.text=()=>{}; board.panel=()=>{}; board.drawPatrolActionTile=()=>{}; board.currentGoalView=()=>({primary:{recommendedAction:'houndScout'}}); board.recommendedPatrolAction=()=> 'houndScout'; const boardView=board.drawPatrolExecuteBoard(fake(),12,40,351,board.state.world.reserve); assert.equal(board.renderedPatrolExecuteBoard.choiceCount,1); assert(boardView>0);
const stale=make(); stale.openPatrolOperationScreen('houndScout'); const staleOption=stale.patrolTaskModal; stale.patrolTaskModal=null; stale.openPatrolOperationScreen('habitat'); assert.equal(stale.patrolTaskModal.id,'habitat'); stale.command=staleOption.placeholder.replace('例如：',''); stale.openPatrolTaskModal(stale.patrolTaskModal); assert.match(stale.command,/东部河岸湿地|水源/);
console.log('patrol single-step check ok: four task modals retained, four-choice board removed, direct real settlement, no duplicate execution, stale draft reset');
