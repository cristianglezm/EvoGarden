import '@react-three/fiber';

declare module 'three/addons/loaders/GLTFLoader' {
  export * from 'three/examples/jsm/loaders/GLTFLoader.js';
}
