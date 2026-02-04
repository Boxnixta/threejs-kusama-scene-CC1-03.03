import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
// --- BASIS SETUP ---
const scene = new THREE.Scene();
const clock = new THREE.Clock();

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 0, 30); 

const renderer = new THREE.WebGLRenderer({ 
    antialias: true,
    canvas: document.querySelector('#canvasThree') // WICHTIG: Verbinde es mit deinem HTML Canvas
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0; 
document.body.appendChild(renderer.domElement);

// --- POST PROCESSING (BLOOM) ---
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight), 
    0.2,  // Stärke des Glows (Strength)
    0.4,  // Radius
    0.4   // Schwellenwert (Threshold) - Niedriger = mehr leuchten
);
composer.addPass(bloomPass);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// --- RAUM MIT PIXEL STREIFEN ---
const canvas = document.createElement('canvas');
canvas.width = 1024;
canvas.height = 1024;
const ctx = canvas.getContext('2d');

// Hintergrund weiß
ctx.fillStyle = '#FFFFFF';
ctx.fillRect(0, 0, 1024, 1024);

// Schwarze Streifen
ctx.strokeStyle = '#000000';
ctx.lineWidth = 60;
for(let i = 0; i < 15; i++) {
    ctx.beginPath();
    ctx.moveTo(0, i * 140);
    ctx.lineTo(1024, i * 140);
    ctx.stroke();
}

// PIXEL DISTORTION 
ctx.fillStyle = '#FFFFFF';
for(let i = 0; i < 8000; i++) {
    const x = Math.random() * 1024;
    const y = Math.random() * 1024;
    const size = Math.random() * 30;
    
    // Zufällig Pixel löschen oder setzen für den Dithering-Look
    if(Math.random() > 0.5) {
        ctx.clearRect(x, y, size, size); // Macht Löcher in Streifen
    } else {
        ctx.fillRect(x, y, size, size);  // Setzt Pixel
    }
}

const roomTex = new THREE.CanvasTexture(canvas);
const roomGeom = new THREE.SphereGeometry(100, 64, 64);
const roomMat = new THREE.MeshBasicMaterial({ 
    map: roomTex, 
    side: THREE.BackSide 
});
const room = new THREE.Mesh(roomGeom, roomMat);
scene.add(room);

// --- LICHT & UMGEBUNG ---
const spotLight = new THREE.PointLight(0xffffff, 250);
spotLight.position.set(15, 20, 15);
scene.add(spotLight);

const sideLight = new THREE.PointLight(0xffffff, 200);
sideLight.position.set(-15, 10, 5);
scene.add(sideLight);

const rgbeLoader = new RGBELoader();
rgbeLoader.load('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/equirectangular/royal_esplanade_1k.hdr', (texture) => {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = texture;
});

// --- MATERIALIEN ---

const getFrostedMaterial = (color) => {
    const baseColor = new THREE.Color(color);
    return new THREE.MeshPhysicalMaterial({
        color: baseColor,
        attenuationColor: baseColor.clone().multiplyScalar(1.2),
        attenuationDistance: 1.2, 
        transmission: 1.0,
        roughness: 0.3,
        ior: 1.4,
        thickness: 0.8,
        side: THREE.DoubleSide,
        transparent: true,
        // GLOW-EFFEKT:
        emissive: baseColor,      // Das Material leuchtet in eigener Farbe
        emissiveIntensity: 1.5,   // Stärke des Glühens 
        specularIntensity: 2.0,
        specularColor: new THREE.Color(0xffffff),
    });
};

const getClearMaterial = () => new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0xffffff),
    transmission: 1.0,
    ior: 1.3,
    dispersion: 15.0, 
    roughness: 0.3,
    thickness: 1.0,
    transparent: true,
    depthWrite: false,      
    side: THREE.DoubleSide,
    specularIntensity: 2.0,
    specularColor: new THREE.Color(0xffffff),
});

// --- KUGEL-LOGIK ---

const bubbles = [];
const colorPalette = ['#F8D12E', '#D3212D', '#0059CF', '#00A358', '#FF428A'];

function createBubbleGroup(color) {
    const group = new THREE.Group();
    const outerRadius = 2; // Radius der großen Glaskugel

    // 1. Glaskugel
    const outerGeom = new THREE.SphereGeometry(outerRadius, 64, 64);
    const outerSphere = new THREE.Mesh(outerGeom, getClearMaterial());
    group.add(outerSphere);

    // 2. Bunte Scheiben (sticking to the wall)
    // CylinderGeometry(Radius oben, Radius unten, Höhe, Segmente)
    const diskGeom = new THREE.CylinderGeometry(0.8, 0.8, 0.1, 32);
    
    for(let i = 0; i < 6; i++) { 
        const diskMat = getFrostedMaterial(color);
        const disk = new THREE.Mesh(diskGeom, diskMat);
        
        // --- POSITIONIERUNG AUF DER OBERFLÄCHE ---
        // "Erzeuge einen zufälligen Vektor und normiere ihn"
        const position = new THREE.Vector3(
            Math.random() - 0.5,
            Math.random() - 0.5,
            Math.random() - 0.5
        ).normalize();

        // Setzt die Scheibe exakt auf den Radius (minus einen winzigen Spalt gegen Flackern)
        disk.position.copy(position).multiplyScalar(outerRadius - 0.06);

        // --- AUSRICHTUNG ---
        // Die Scheibe muss zum Mittelpunkt schauen, um flach auf der Kugel zu liegen
        // Da ein Zylinder in Three.js standardmäßig "steht" (Y-Achse), 
        //  so ausrichten, dass die Y-Achse vom Zentrum weg zeigt
        disk.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), position);

        group.add(disk);
    }
    
    return group;
}

// 40 Kugel-Gruppen im Raum
for (let i = 0; i < 40; i++) {
    const randomColor = colorPalette[Math.floor(Math.random() * colorPalette.length)];
    const bubbleGroup = createBubbleGroup(randomColor);
    
    // Zufällige Verteilung im Raum
    const x = (Math.random() - 0.5) * 40;
    const y = (Math.random() - 0.5) * 30;
    const z = (Math.random() - 0.5) * 30;
    
    bubbleGroup.position.set(x, y, z);
    bubbleGroup.userData.basePosition = bubbleGroup.position.clone();
    
    scene.add(bubbleGroup);
    bubbles.push(bubbleGroup);
}



// --- ANIMATION ---
function animate() {
    requestAnimationFrame(animate);
    const elapsed = clock.getElapsedTime();
  
    // 1. Raum-Rotation (Der Hintergrund)
    if (room) {
        room.rotation.y += 0.0003; 
        room.rotation.z += 0.0001; 
    }

    // 2. Bubble-Animation (Das sanfte Schweben)
    bubbles.forEach((group, i) => {
        const targetPos = group.userData.basePosition.clone();
        
        // Sanftes Schweben auf der Y-Achse (Sinus)
        // und ein ganz leichtes Hin-und-Her auf der X-Achse (Cosinus)
        targetPos.y += Math.sin(elapsed * 0.5 + i) * 0.7;
        targetPos.x += Math.cos(elapsed * 0.3 + i) * 0.3;
        
        // Sanfter Übergang zur neuen Position
        group.position.lerp(targetPos, 0.05);
        
        // Konstante Eigenrotation der Gruppe
        group.rotation.y += 0.005;
        group.rotation.z += 0.002;
    });

    controls.update();
    composer.render();
}
animate();
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
});