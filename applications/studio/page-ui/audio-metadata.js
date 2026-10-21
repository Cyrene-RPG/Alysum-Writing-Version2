/** Read metadata without uploading or keeping the recording in browser storage. */
export function recordingDuration(file) {
    return new Promise((resolve,reject)=>{
        const audio=document.createElement('audio'),url=URL.createObjectURL(file);let done=false;
        const timeout=setTimeout(()=>finish(new Error('Could not read this recording. Try exporting it as MP3 or M4A.')),15000);
        function finish(error,value){
            if(done)return;done=true;
            clearTimeout(timeout);audio.onloadedmetadata=null;audio.ondurationchange=null;audio.onerror=null;
            audio.removeAttribute('src');audio.load();URL.revokeObjectURL(url);
            if(error)reject(error);else resolve(value);
        }
        function ready(){
            if(Number.isFinite(audio.duration)&&audio.duration>0){finish(null,audio.duration);return;}
            // Some WebM exports discover duration only after seeking to the end.
            if(audio.duration===Infinity)try{audio.currentTime=1e10;}catch{}
        }
        audio.preload='metadata';audio.onloadedmetadata=ready;audio.ondurationchange=ready;
        audio.onerror=()=>finish(new Error('This browser could not read the recording. Try MP3 or M4A.'));
        audio.src=url;
    });
}
