import { authorTipOptions, paypalTipUrl, cashAppTip } from '/core/library/author-tips.js';

export function mountReaderTips(root, {supportLinks, isOwner=false, onLayout}) {
    const options=authorTipOptions(supportLinks);
    if(!options.length && !isOwner) return;
    const box=document.createElement('section');box.className='reader-tip-box';box.setAttribute('aria-label','Leave the author a tip');
    const heading=document.createElement('h3');heading.textContent='Leave a tip';
    const note=document.createElement('p');note.textContent='Enjoyed the chapter? A tip is optional and goes directly to the author.';
    box.append(heading,note);
    if(!options.length) {
        const setup=document.createElement('a');setup.href='/settings#author-support';setup.textContent='Add your Ko-fi, PayPal.Me or Cash App link in Settings';box.append(setup);root.append(box);return;
    }
    const toggle=document.createElement('button');toggle.type='button';toggle.className='reader-follow';toggle.textContent='Leave a tip';toggle.setAttribute('aria-expanded','false');
    const panel=document.createElement('div');panel.className='reader-tip-panel';panel.hidden=true;
    const content=document.createElement('div');content.className='reader-tip-content';
    let selected=options[0];
    const paint=()=>{
        content.replaceChildren();
        if(selected.kind==='kofi') {
            const instructions=document.createElement('p');instructions.textContent='Choose your amount in Ko-fi below and complete payment with the author.';
            const frame=document.createElement('iframe');frame.src=selected.embedUrl;frame.title='Leave a tip through the author’s Ko-fi';frame.className='reader-tip-frame';frame.loading='lazy';frame.allow='payment';
            content.append(instructions,frame);
        } else if(selected.kind==='paypal' || selected.kind==='cashapp') {
            const isCashApp=selected.kind==='cashapp';
            const form=document.createElement('form');form.className='reader-tip-form';
            const amountLabel=document.createElement('label');amountLabel.textContent='Tip amount';
            const amount=document.createElement('input');amount.type='text';amount.inputMode='decimal';amount.placeholder='Enter amount';amount.required=true;amount.autocomplete='off';amountLabel.append(amount);
            const currencyLabel=document.createElement('label');currencyLabel.textContent='Currency';
            const currency=document.createElement('select');for(const value of (isCashApp?['USD']:['USD','GBP','EUR','CAD','AUD']))currency.append(new Option(value,value));currencyLabel.append(currency);
            const send=document.createElement('button');send.type='submit';send.className='reader-follow';send.textContent=isCashApp?'Copy amount & open Cash App':'Continue to PayPal';
            const error=document.createElement('p');error.setAttribute('role','alert');error.hidden=true;
            form.append(amountLabel,currencyLabel,send,error);
            form.addEventListener('submit',async event=>{
                event.preventDefault();
                const cashTip=isCashApp?cashAppTip(selected.url,amount.value):null;
                const url=isCashApp?cashTip?.url:paypalTipUrl(selected.url,amount.value,currency.value);
                if(!url){error.textContent='Enter an amount greater than zero, up to 10,000, with at most two decimal places.';error.hidden=false;amount.focus();onLayout?.();return;}
                error.hidden=true;
                if(isCashApp) {
                    let copy;
                    try {copy=navigator.clipboard?.writeText(cashTip.amount);} catch {copy=null;}
                    window.open(url,'_blank','noopener,noreferrer');
                    try {
                        if(!copy)throw Error('Copy unavailable');await copy;
                        status.textContent=`Copied $${cashTip.amount} USD. Paste the amount in Cash App and confirm the recipient before sending.`;
                    } catch {status.textContent=`Tip amount: $${cashTip.amount} USD. Enter this amount in Cash App and confirm the recipient before sending.`;}
                    onLayout?.();
                } else window.open(url,'_blank','noopener,noreferrer');
            });
            const status=document.createElement('p');status.setAttribute('role','status');
            const help=document.createElement('p');help.textContent=isCashApp?'Enter an amount here. We’ll copy it and open the author’s Cash App link; paste or enter it there, then confirm the tip.':'Review the recipient, amount and any fees on PayPal before sending.';content.append(form,help,status);
        } else {
            const help=document.createElement('p');help.textContent='Choose your amount and confirm the tip in Cash App.';content.append(help);
        }
        const external=document.createElement('a');external.href=selected.url;external.target='_blank';external.rel='noopener noreferrer';external.textContent=`Open the author’s ${selected.label} ↗`;content.append(external);
        onLayout?.();
    };
    if(options.length>1) {
        const choices=document.createElement('div');choices.className='reader-tip-services';choices.setAttribute('role','group');choices.setAttribute('aria-label','Tip through');
        for(const option of options) {
            const button=document.createElement('button');button.type='button';button.className='reader-follow';button.textContent=option.label;button.setAttribute('aria-pressed',String(option===selected));
            button.addEventListener('click',()=>{
                selected=option;for(const sibling of choices.children)sibling.setAttribute('aria-pressed',String(sibling===button));paint();
            });choices.append(button);
        }
        panel.append(choices);
    }
    panel.append(content);box.append(toggle,panel);root.append(box);
    toggle.addEventListener('click',()=>{
        panel.hidden=!panel.hidden;toggle.setAttribute('aria-expanded',String(!panel.hidden));toggle.textContent=panel.hidden?'Leave a tip':'Close tipping';
        if(!panel.hidden && !content.childElementCount)paint();
        if(panel.hidden)content.replaceChildren();
        onLayout?.();
    });
}
