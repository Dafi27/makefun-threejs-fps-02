// texture.js — procedural canvas textures, painted in code so the game needs
// no image assets. All textures are authored here at runtime.
import * as THREE from 'three';

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Dark asphalt with faint patch noise, painted lane dashes and site letters.
export function asphaltTexture() {
  return canvasTexture(1024, 1024, (g, w, h) => {
    g.fillStyle = '#2b2e33'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) {
      const v = 30 + Math.random() * 26;
      g.fillStyle = `rgb(${v},${v + 2},${v + 5})`;
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    // expansion joints
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 3;
    for (let i = 0; i <= 4; i++) {
      g.beginPath(); g.moveTo(0, i * 256); g.lineTo(w, i * 256); g.stroke();
      g.beginPath(); g.moveTo(i * 256, 0); g.lineTo(i * 256, h); g.stroke();
    }
    // faded centre dashes along the three lanes
    g.fillStyle = 'rgba(214,178,90,0.5)';
    for (const y of [300, 512, 724]) {
      for (let x = 0; x < w; x += 96) g.fillRect(x, y, 48, 6);
    }
    // hazard chevrons at the two sites
    g.strokeStyle = 'rgba(214,178,90,0.65)'; g.lineWidth = 10;
    for (const [cx, cy] of [[180, 180], [844, 844]]) {
      g.save(); g.translate(cx, cy); g.rotate(Math.PI / 4);
      for (let i = -2; i <= 2; i++) {
        g.beginPath(); g.moveTo(-56, i * 26); g.lineTo(56, i * 26); g.stroke();
      }
      g.restore();
    }
    // big site letters painted on the ground
    g.fillStyle = 'rgba(232,226,210,0.55)';
    g.font = 'bold 150px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('A', 180, 180);
    g.fillText('B', 844, 844);
  });
}

// Corrugated container side. Tint comes from the material color.
export function containerTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 16) {
      const grad = g.createLinearGradient(x, 0, x + 16, 0);
      grad.addColorStop(0, 'rgba(0,0,0,0.28)');
      grad.addColorStop(0.5, 'rgba(255,255,255,0.10)');
      grad.addColorStop(1, 'rgba(0,0,0,0.28)');
      g.fillStyle = grad; g.fillRect(x, 0, 16, h);
    }
    // rust streaks from the top edge
    for (let i = 0; i < 26; i++) {
      const x = Math.random() * w, len = 20 + Math.random() * 70;
      g.fillStyle = 'rgba(122,72,32,0.20)';
      g.fillRect(x, 0, 3 + Math.random() * 5, len);
    }
    // stencil number
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.font = 'bold 26px monospace'; g.textAlign = 'left';
    g.fillText('RH-044', 14, 34);
  });
}

// Flat wall panels for the warehouses: concrete with a painted band.
export function wallTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#8d8578'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2200; i++) {
      const v = 120 + Math.random() * 40;
      g.fillStyle = `rgba(${v},${v - 6},${v - 18},0.5)`;
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    g.fillStyle = '#b3492e'; g.fillRect(0, 168, w, 26);
    g.fillStyle = 'rgba(0,0,0,0.4)';
    g.font = 'bold 20px monospace'; g.fillText('RUST HARBOR', 12, 188);
  });
}
