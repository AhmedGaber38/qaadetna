// Tea-stir sound. Lazy: nothing is downloaded until the first user interaction.
const KEY='qaadetna_sound'
let a:any=null
let playing=false
let unlocked=false

export const soundOn=():boolean=>{try{return localStorage.getItem(KEY)!=='off'}catch(e){return true}}
export const setSoundOn=(v:boolean)=>{
  try{localStorage.setItem(KEY,v?'on':'off')}catch(e){}
  if(!v&&a){try{a.pause();a.currentTime=0}catch(e){}playing=false}
}

function el(){
  if(!a){
    a=new Audio()
    a.preload='none'
    a.src='/tea-stir.mp3'
    const stop=()=>{playing=false}
    a.addEventListener('ended',stop);a.addEventListener('pause',stop);a.addEventListener('error',stop)
  }
  return a
}

// Plays once. Ignored if sound is off or it is still playing (no overlap). Never throws.
export function playTea(){
  if(!soundOn()||playing)return
  try{
    const x=el()
    playing=true
    x.muted=false
    try{x.currentTime=0}catch(e){}
    const p=x.play()
    if(p&&p.catch)p.catch(()=>{playing=false})
  }catch(e){playing=false}
}

// Silent "unlock" inside a user gesture so later plays (after a network call) are allowed on iPhone.
export function unlock(){
  if(unlocked||playing||!soundOn())return
  try{
    const x=el()
    unlocked=true
    x.muted=true
    const p=x.play()
    const done=()=>{x.muted=false}
    if(p&&p.then)p.then(()=>{if(!playing){x.pause();try{x.currentTime=0}catch(e){}}done()},()=>{done();unlocked=false})
    else{x.pause();done()}
  }catch(e){unlocked=false}
}

// First click/tap/key after the page is ready: play on the login screen, otherwise just unlock.
export function armFirstInteraction(getState:()=>{ready:boolean;auth:boolean}){
  const evs=['click','touchend','keydown']
  const h=(e:any)=>{
    if(!getState().ready)return
    const t=e&&e.target
    if(t&&t.closest&&t.closest('[data-sound-toggle]'))return
    evs.forEach(n=>removeEventListener(n,h,true))
    if(getState().auth)playTea();else unlock()
  }
  evs.forEach(n=>addEventListener(n,h,true))
  return()=>{evs.forEach(n=>removeEventListener(n,h,true))}
}
