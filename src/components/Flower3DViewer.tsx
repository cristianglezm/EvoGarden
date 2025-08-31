

import React, { Suspense, useEffect, useState, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';

// Animation constants and easing function
const SPROUT_DURATION = 800; // ms
const CAMERA_MOVE_DURATION = 1200; // ms
const easeOutQuad = (t: number) => t * (2 - t);


interface ModelProps {
  gltfString: string;
}

const AnimatedModel: React.FC<ModelProps> = ({ gltfString }) => {
    const [model, setModel] = useState<THREE.Group | null>(null);
    const modelRef = useRef<THREE.Group>(null!);
    const { camera, controls } = useThree();
    const clockRef = useRef<THREE.Clock | null>(null);
    const animationStateRef = useRef({
        cameraDone: false,
        startPos: new THREE.Vector3(),
        endPos: new THREE.Vector3(),
        center: new THREE.Vector3(),
    });

    useEffect(() => {
        const loader = new GLTFLoader();
        loader.parse(gltfString, '', (gltf: GLTF) => {
            const loadedModel = gltf.scene;
            const box = new THREE.Box3().setFromObject(loadedModel);
            const size = new THREE.Vector3();
            const center = new THREE.Vector3();
            box.getSize(size);
            box.getCenter(center);
            
            // Set initial model state for sprout animation
            loadedModel.position.y = -size.y / 2;
            loadedModel.scale.y = 0.01;
            
            // Set up camera positions for animation
            if (!(camera instanceof THREE.PerspectiveCamera)) return;
            const maxDim = Math.max(size.x, size.y, size.z);
            const fov = camera.fov * (Math.PI / 180);
            const initialCamZ = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 1.2;

            const startPos = new THREE.Vector3(center.x, center.y, center.z + initialCamZ);
            const endPos = new THREE.Vector3(center.x, center.y + initialCamZ * 0.6, center.z);
            
            // Initialize camera and controls
            camera.position.copy(startPos);
            camera.lookAt(center);
            if (controls) {
                const orbitControls = controls as OrbitControlsImpl;
                orbitControls.target.copy(center);
                orbitControls.enabled = false; // Disable until animation is done
            }
            
            // Store animation parameters and reset state
            animationStateRef.current = {
                cameraDone: false,
                startPos,
                endPos,
                center,
            };
            
            setModel(loadedModel);
            clockRef.current = new THREE.Clock(); // Start animation clock
        });
        
    // This effect should re-run if the model string changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gltfString, camera]);

    useFrame((_) => {
        if (!model || !clockRef.current || !controls) return;
        
        const { cameraDone, startPos, endPos, center } = animationStateRef.current;
        const orbitControls = controls as OrbitControlsImpl;
        
        const elapsed = clockRef.current.getElapsedTime() * 1000;

        // 1. Sprout Animation
        const tSprout = Math.min(elapsed / SPROUT_DURATION, 1);
        if (modelRef.current) {
            modelRef.current.scale.y = easeOutQuad(tSprout);
        }

        // 2. Camera Animation (starts after sprouting)
        if (elapsed > SPROUT_DURATION && !cameraDone) {
            const raw = (elapsed - SPROUT_DURATION) / CAMERA_MOVE_DURATION;
            const tCam = THREE.MathUtils.clamp(raw, 0, 1);
            const eased = easeOutQuad(tCam);
            
            camera.position.lerpVectors(startPos, endPos, eased);
            camera.lookAt(center);
            orbitControls.target.copy(center);

            if (tCam === 1) {
                animationStateRef.current.cameraDone = true;
                orbitControls.enabled = true; // Enable controls after animation
            }
        }
        
        // Always update controls to handle damping etc.
        orbitControls.update();
    });

    if (!model) return null;
    
    // Using a ref allows us to manipulate the object imperatively in useFrame
    return <primitive ref={modelRef} object={model} />;
};


interface Flower3DViewerProps {
    gltfString: string;
}

export const Flower3DViewer: React.FC<Flower3DViewerProps> = ({ gltfString }) => {
    return (
        <div className="w-full h-full bg-background/50 rounded-b-lg cursor-grab active:cursor-grabbing">
            <Canvas camera={{ fov: 50, position: [0, 0, 5] }}>
                <Suspense fallback={null}>
                    {/* Add custom lighting to replace the <Stage> environment */}
                    <ambientLight intensity={Math.PI / 2} />
                    <directionalLight position={[5, 10, 7.5]} intensity={1.0} />
                    
                    <AnimatedModel gltfString={gltfString} />
                </Suspense>
                <OrbitControls makeDefault />
            </Canvas>
        </div>
    );
};
