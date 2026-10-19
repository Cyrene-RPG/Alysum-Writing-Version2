import { authorTipOptions, paypalTipUrl } from '/core/library/author-tips.js';

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
        } else if(selected.kind==='paypal') {
            const form=document.createElement('form');form.className='reader-tip-form';
            const amountLabel=document.createElement('label');amountLabel.textContent='Tip amount';
            const amount=document.createElement('input');amount.type='text';amount.inputMode='decimal';amount.placeholder='Enter amount';amount.required=true;amount.autocomplete='off';amountLabel.append(amount);
            const currencyLabel=document.createElement('label');currencyLabel.textContent='Currency';
            const currency=document.createElement('select');for(const value of ['USD','GBP','EUR','CAD','AUD'])currency.append(new Option(value,value));currencyLabel.append(currency);
            const send=document.createElement('button');send.type='submit';send.className='reader-follow';send.textContent='Continue to PayPal';
            const error=document.createElement('p');error.setAttribute('role','alert');error.hidden=true;
            form.append(amountLabel,currencyLabel,send,error);
            form.addEventListener('submit',event=>{
                event.preventDefault();const url=paypalTipUrl(selected.url,amount.value,currency.value);
                if(!url){error.textContent='Enter an amount greater than zero, up to 10,000, with at most two decimal places.';error.hidden=false;amount.focus();onLayout?.();return;}
                window.open(url,'_blank','noopener,noreferrer');
            });
            const help=document.createElement('p');help.textContent='Review the recipient, amount and any fees on PayPal before sending.';content.append(form,help);
        } else {
            const help=document.createElement('p');help.textContent='Choose your amount and confirm the tip in Cash App.';content.append(help);
        }
        const external=document.createElement('a');external.href=selected.url;external.target='_blank';external.rel='noopener noreferrer';external.textContent=`Open the author’s ${selected.label} ↗`;content.append(external);
        onLayout?.();
    };
    if(options.length>1) {
        const label=document.createElement('label');label.textContent='Tip through';const picker=document.createElement('select');
        for(const option of options)picker.append(new Option(option.label,option.kind));label.append(picker);panel.append(label);
        picker.addEventListener('change',()=>{selected=options.find(option=>option.kind===picker.value);paint();});
    }
    panel.append(content);box.append(toggle,panel);root.append(box);
    toggle.addEventListener('click',()=>{
        panel.hidden=!panel.hidden;toggle.setAttribute('aria-expanded',String(!panel.hidden));toggle.textContent=panel.hidden?'Leave a tip':'Close tipping';
        if(!panel.hidden && !content.childElementCount)paint();
        if(panel.hidden)content.replaceChildren();
        onLayout?.();
    });
}
