const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try {
  const page=await browser.newPage({viewport:{width:1500,height:1000}}), errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(process.env.STUDIO_URL || 'http://127.0.0.1:3000/book-studio');
  const ready=()=>page.waitForFunction(()=>/\d+ pages/.test(document.getElementById('page-summary').textContent));
  await ready();assert.ok(await page.locator('.paper').count()>=3);
  await page.locator('[data-setting="trim"]').selectOption('5x8');await page.waitForFunction(()=>document.getElementById('page-summary').textContent.includes('5 × 8'));
  assert.equal(await page.locator('.paper-body').evaluateAll(nodes=>nodes.filter(n=>n.scrollHeight>n.clientHeight+1).length),0);
  const longText=Array.from({length:1400},(_,i)=>`word${i}`).join(' ');
  page.on('dialog',dialog=>dialog.accept());
  await page.locator('#file-input').setInputFiles({name:'long.html',mimeType:'text/html',buffer:Buffer.from(`<h1>Long chapter</h1><p><em>${longText}</em></p><script>window.injected=true</script>`)});
  await page.waitForFunction(()=>document.getElementById('book-title').value==='long');await page.waitForFunction(()=>document.querySelector('.paper h2')?.textContent==='Long chapter');await ready();
  const printed=await page.locator('.paper-body p').allTextContents();assert.equal(printed.join(''),longText);
  assert.equal(await page.evaluate(()=>window.injected),undefined);
  assert.equal(await page.locator('.paper-body').evaluateAll(nodes=>nodes.filter(n=>n.scrollHeight>n.clientHeight+1).length),0);
  await page.reload();await ready();assert.equal(await page.locator('#book-title').inputValue(),'long');
  const downloadPromise=page.waitForEvent('download');await page.locator('#export-epub').click();const download=await downloadPromise;assert.match(download.suggestedFilename(),/\.epub$/);
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:process.env.STUDIO_SCREENSHOT || '/tmp/book-studio-mobile.png',fullPage:true});
  assert.deepEqual(errors,[]);console.log('Book Studio browser checks passed.');
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
