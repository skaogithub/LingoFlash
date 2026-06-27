import fs from 'fs';

const JS_URL = 'https://lingoflash-1010889582939.us-west1.run.app/assets/index-l7MSzTeF.js';

async function run() {
  const res = await fetch(JS_URL);
  const code = await res.text();
  
  const term = "assistant for LingoFlash. Break the sentence into 2-4 rhythmic chunks";
  const idx = code.indexOf(term);
  if (idx !== -1) {
    console.log(`Found prompt at index ${idx}.`);
    console.log(code.substring(idx - 800, idx + 1200));
  } else {
    console.log(`Could not find prompt in JS.`);
  }
}

run();
