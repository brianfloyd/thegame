const fs = require('fs');
const path = 'public/gameeditors/map-editor.js';
let content = fs.readFileSync(path, 'utf8');

const oldCode = `        handleKeyDown(e) {
            // Pan with arrow keys
            const panAmount = 5;
            switch (e.key) {
                case 'ArrowLeft':
                    this.panX -= panAmount;
                    this.render();
                    break;
                case 'ArrowRight':
                    this.panX += panAmount;
                    this.render();
                    break;
                case 'ArrowUp':
                    this.panY += panAmount;
                    this.render();
                    break;
                case 'ArrowDown':
                    this.panY -= panAmount;
                    this.render();
                    break;
                case 'c':
                    if (e.ctrlKey) return;
                    this.setMode('create');
                    break;
                case 'Escape':
                    this.setMode('select');
                    this.selectedRoom = null;
                    this.isCreatingRoom = false;
                    this.render();
                    break;
            }
        },`;

const newCode = `        handleKeyDown(e) {
            // Skip if typing in input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            const panAmount = 5;
            // Numpad 8-way navigation
            const code = e.code || '';
            if (code.startsWith('Numpad')) {
                e.preventDefault();
                if (code === 'Numpad4') { this.panX -= panAmount; }
                else if (code === 'Numpad6') { this.panX += panAmount; }
                else if (code === 'Numpad8') { this.panY += panAmount; }
                else if (code === 'Numpad2') { this.panY -= panAmount; }
                else if (code === 'Numpad7') { this.panX -= panAmount; this.panY += panAmount; }
                else if (code === 'Numpad9') { this.panX += panAmount; this.panY += panAmount; }
                else if (code === 'Numpad1') { this.panX -= panAmount; this.panY -= panAmount; }
                else if (code === 'Numpad3') { this.panX += panAmount; this.panY -= panAmount; }
                else if (code === 'Numpad5' && this.selectedRoom) { this.centerOnRoom(this.selectedRoom); }
                this.render();
                return;
            }
            // Arrow keys and shortcuts
            switch (e.key) {
                case 'ArrowLeft': this.panX -= panAmount; this.render(); break;
                case 'ArrowRight': this.panX += panAmount; this.render(); break;
                case 'ArrowUp': this.panY += panAmount; this.render(); break;
                case 'ArrowDown': this.panY -= panAmount; this.render(); break;
                case 'c': if (!e.ctrlKey) this.setMode('create'); break;
                case 'Escape': this.setMode('select'); this.selectedRoom = null; this.isCreatingRoom = false; this.render(); break;
            }
        },`;

if (content.includes(oldCode)) {
    content = content.replace(oldCode, newCode);
    fs.writeFileSync(path, content);
    console.log('SUCCESS: Numpad navigation added to map editor');
} else {
    console.log('ERROR: Could not find the code to replace');
    console.log('Searching for handleKeyDown...');
    if (content.includes('handleKeyDown')) {
        console.log('handleKeyDown found in file');
    }
}

