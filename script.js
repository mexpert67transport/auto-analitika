const fs = require('fs');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

async function run() {
    const doc = await pdfjsLib.getDocument('C:/Users/m_exp/OneDrive/Рабочий стол/gemini/Кт1129.pdf').promise;
    const page = await doc.getPage(1);
    const textContent = await page.getTextContent();
    
    const items = textContent.items.map(i => ({ str: i.str, x: i.transform[4], y: i.transform[5] }));
    items.sort((a,b) => Math.abs(a.y - b.y) < 3 ? a.x - b.x : b.y - a.y);
    
    let res = '';
    let lastY = -1;
    for(let i of items) {
        if(Math.abs(i.y - lastY) > 3) res += '\n';
        res += i.str + ' ';
        lastY = i.y;
    }
    fs.writeFileSync('debug_pdf.txt', res);
}
run();
