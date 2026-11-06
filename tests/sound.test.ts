import {beforeEach,expect,it,vi} from 'vitest'
let audio:any
beforeEach(()=>{
  vi.resetModules();localStorage.clear()
  vi.stubGlobal('Audio',class{
    src='';muted=false;currentTime=0;preload='';handlers:Record<string,()=>void>={}
    play=vi.fn(()=>Promise.resolve());pause=vi.fn(()=>this.handlers.pause?.())
    constructor(){audio=this}
    getAttribute(){return this.src}
    addEventListener(name:string,callback:()=>void){this.handlers[name]=callback}
  })
})
it('plays item audio on demand and prevents overlapping playback',async()=>{
  const {playItem}=await import('../src/sound')
  playItem('/coffee.mp3');expect(audio.src).toBe('/coffee.mp3');expect(audio.play).toHaveBeenCalledOnce()
  playItem('/tea.mp3');expect(audio.play).toHaveBeenCalledOnce()
  audio.handlers.ended();playItem('/tea.mp3');expect(audio.src).toBe('/tea.mp3');expect(audio.play).toHaveBeenCalledTimes(2)
})
it('stops audio and blocks playback while muted',async()=>{
  const {playItem,setSoundOn}=await import('../src/sound')
  playItem('/coffee.mp3');setSoundOn(false);expect(audio.pause).toHaveBeenCalled()
  playItem('/tea.mp3');expect(audio.play).toHaveBeenCalledOnce()
  setSoundOn(true);playItem(null);expect(audio.src).toBe('/tea-stir.mp3')
})
