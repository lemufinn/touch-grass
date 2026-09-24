const container = document.getElementById('webgl-container');

let scene, camera, renderer;
let grassInstancedMesh, grassMaterial;
let rainSystem, rainGeometry;
let dirLight, ambientLight, planeTerrain;
let raycaster, mouseVector;

const GRASS_COUNT = 50000;
const FIELD_SIZE = 24;

const dummy = new THREE.Object3D();
const bladeTransforms = [];

let windStrength = 0.3;
let targetWindStrength = 0.3;
let windChangeTimer = 0;

let isRaining = false;
let touchPoint = new THREE.Vector3(-1000, 0, -1000);

function init3DEngine() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x122415);

  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 18, 5);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  const groundGeo = new THREE.PlaneGeometry(FIELD_SIZE, FIELD_SIZE);
  groundGeo.rotateX(-Math.PI / 2);
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x141f12, roughness: 0.95 });
  planeTerrain = new THREE.Mesh(groundGeo, groundMat);
  scene.add(planeTerrain);

  raycaster = new THREE.Raycaster();
  mouseVector = new THREE.Vector2(-1000, -1000);

  ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
  scene.add(ambientLight);

  dirLight = new THREE.DirectionalLight(0xfffaed, 1.3);
  dirLight.position.set(10, 25, 10);
  scene.add(dirLight);

  buildGrassMesh();
  buildRainParticles();

  window.addEventListener('resize', onWindowResize);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerdown', onPointerMove);
}

function buildGrassMesh() {
  const bladeGeo = new THREE.BufferGeometry();
  
  const positions = new Float32Array([
    -0.12, 0.0, 0.0,
     0.12, 0.0, 0.0,
    -0.09, 0.6, 0.1,
     0.09, 0.6, 0.1,
    -0.04, 1.2, 0.3,
     0.04, 1.2, 0.3,
     0.00, 1.7, 0.55
  ]);

  const indices = [
    0, 1, 2,  2, 1, 3,
    2, 3, 4,  4, 3, 5,
    4, 5, 6
  ];

  bladeGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  bladeGeo.setIndex(indices);
  bladeGeo.computeVertexNormals();

  grassMaterial = new THREE.MeshLambertMaterial({
    color: 0x44a332,
    side: THREE.DoubleSide
  });

  grassInstancedMesh = new THREE.InstancedMesh(bladeGeo, grassMaterial, GRASS_COUNT);

  const colorVariants = [
    new THREE.Color(0x388e22),
    new THREE.Color(0x4ca62b),
    new THREE.Color(0x52b82e),
    new THREE.Color(0x2f7a1b)
  ];

  for (let i = 0; i < GRASS_COUNT; i++) {
    const x = (Math.random() - 0.5) * FIELD_SIZE;
    const z = (Math.random() - 0.5) * FIELD_SIZE;
    const rotY = Math.random() * Math.PI * 2;
    const scale = 0.75 + Math.random() * 0.5;

    dummy.position.set(x, 0, z);
    dummy.rotation.set((Math.random() - 0.5) * 0.2, rotY, (Math.random() - 0.5) * 0.2);
    dummy.scale.set(scale, scale, scale);
    dummy.updateMatrix();

    grassInstancedMesh.setMatrixAt(i, dummy.matrix);

    const rndColor = colorVariants[Math.floor(Math.random() * colorVariants.length)];
    grassInstancedMesh.setColorAt(i, rndColor);

    bladeTransforms.push({
      x: x, z: z,
      rotX: 0, rotZ: 0,
      targetRotX: 0, targetRotZ: 0,
      baseRotY: rotY,
      scale: scale
    });
  }

  grassInstancedMesh.instanceMatrix.needsUpdate = true;
  if (grassInstancedMesh.instanceColor) grassInstancedMesh.instanceColor.needsUpdate = true;
  scene.add(grassInstancedMesh);
}

function buildRainParticles() {
  const rainCount = 1200;
  rainGeometry = new THREE.BufferGeometry();
  const positions = new Float32Array(rainCount * 3);

  for (let i = 0; i < rainCount * 3; i += 3) {
    positions[i] = (Math.random() - 0.5) * FIELD_SIZE;
    positions[i + 1] = Math.random() * 16;
    positions[i + 2] = (Math.random() - 0.5) * FIELD_SIZE;
  }

  rainGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  rainSystem = new THREE.Points(
    rainGeometry, 
    new THREE.PointsMaterial({ color: 0x9bcfff, size: 0.11, transparent: true, opacity: 0.65 })
  );
  rainSystem.visible = false;
  scene.add(rainSystem);
}

function initAutomaticLocationAndWeather() {
  const savedLat = localStorage.getItem('user_lat');
  const savedLon = localStorage.getItem('user_lon');

  if (savedLat && savedLon) {
    fetchWeatherData(savedLat, savedLon);
  } else if ("geolocation" in navigator) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        localStorage.setItem('user_lat', lat);
        localStorage.setItem('user_lon', lon);
        fetchWeatherData(lat, lon);
      },
      () => updateEnvironmentByTimeOnly()
    );
  } else {
    updateEnvironmentByTimeOnly();
  }
}

async function fetchWeatherData(lat, lon) {
  try {
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`);
    const data = await res.json();
    const code = data.current_weather.weathercode;

    if ([51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99].includes(code)) {
      isRaining = true;
      rainSystem.visible = true;
    }

    updateEnvironmentByTimeOnly();
  } catch (err) {
    updateEnvironmentByTimeOnly();
  }
}

function updateEnvironmentByTimeOnly() {
  const hour = new Date().getHours();

  if (hour >= 6 && hour < 12) {
    scene.background = new THREE.Color(0x182c1a);
    grassMaterial.color.setHex(0x44a332);
    dirLight.color.setHex(0xfffaed);
    dirLight.intensity = 1.35;
  } else if (hour >= 12 && hour < 18) {
    scene.background = new THREE.Color(0x23180c);
    grassMaterial.color.setHex(0x9fa832);
    dirLight.color.setHex(0xffaa44);
    dirLight.intensity = 1.25;
  } else {
    scene.background = new THREE.Color(0x050c06);
    grassMaterial.color.setHex(0x174013);
    dirLight.color.setHex(0x4466aa);
    dirLight.intensity = 0.35;
  }
}

function onPointerMove(e) {
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;

  mouseVector.x = (clientX / window.innerWidth) * 2 - 1;
  mouseVector.y = -(clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouseVector, camera);
  const intersects = raycaster.intersectObject(planeTerrain);

  if (intersects.length > 0) {
    touchPoint.copy(intersects[0].point);
  }
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// Modal Toggle Handlers
const btnInfo = document.getElementById('btn-info');
const btnGrassy = document.getElementById('btn-grassy');
const modalInfo = document.getElementById('modal-info');
const modalGrassy = document.getElementById('modal-grassy');
const closeInfo = document.getElementById('close-info');
const closeGrassy = document.getElementById('close-grassy');

btnInfo.onclick = () => modalInfo.classList.add('active');
closeInfo.onclick = () => modalInfo.classList.remove('active');

btnGrassy.onclick = () => modalGrassy.classList.add('active');
closeGrassy.onclick = () => modalGrassy.classList.remove('active');

function animate(time) {
  requestAnimationFrame(animate);

  const sec = time * 0.001;

  if (time > windChangeTimer) {
    targetWindStrength = 0.15 + Math.random() * 0.55;
    windChangeTimer = time + 3000 + Math.random() * 5000;
  }
  windStrength += (targetWindStrength - windStrength) * 0.02;

  for (let i = 0; i < GRASS_COUNT; i++) {
    const blade = bladeTransforms[i];

    const windX = Math.sin(sec * 1.8 + blade.x * 0.5) * windStrength * 0.45;
    const windZ = Math.cos(sec * 1.6 + blade.z * 0.5) * windStrength * 0.45;

    const dx = blade.x - touchPoint.x;
    const dz = blade.z - touchPoint.z;
    const dist = Math.hypot(dx, dz);

    let pushX = 0, pushZ = 0;
    if (dist < 2.6) {
      const power = (1 - dist / 2.6) * 1.3;
      pushX = (dx / dist) * power;
      pushZ = (dz / dist) * power;
    }

    blade.targetRotX = windX + pushX;
    blade.targetRotZ = windZ + pushZ;

    blade.rotX += (blade.targetRotX - blade.rotX) * 0.1;
    blade.rotZ += (blade.targetRotZ - blade.rotZ) * 0.1;

    dummy.position.set(blade.x, 0, blade.z);
    dummy.rotation.set(blade.rotX, blade.baseRotY, blade.rotZ);
    dummy.scale.set(blade.scale, blade.scale, blade.scale);
    dummy.updateMatrix();

    grassInstancedMesh.setMatrixAt(i, dummy.matrix);
  }
  grassInstancedMesh.instanceMatrix.needsUpdate = true;

  if (isRaining) {
    const pos = rainGeometry.attributes.position.array;
    for (let i = 1; i < pos.length; i += 3) {
      pos[i] -= 0.45;
      if (pos[i] < 0) pos[i] = 16;
    }
    rainGeometry.attributes.position.needsUpdate = true;
  }

  renderer.render(scene, camera);
}

init3DEngine();
initAutomaticLocationAndWeather();
requestAnimationFrame(animate);
