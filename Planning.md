# EvoGarden Planning

This document provides a detailed, technical blueprint for recreating the EvoGarden simulation application. It is intended for an AI agent with expertise in React, TypeScript, Vite, and WebAssembly integration.

## 1. Project Goal

To build a web-based predator-prey simulation in a garden environment. The core of the simulation is the genetic evolution of flowers, whose visual and statistical traits are determined by a genome's response to environmental factors. These flowers are affected by insects (pollinators/herbivores) and birds (predators). The simulation is rendered on a high-performance HTML5 canvas.

## 2. Core Technologies & Setup

-   **Framework/Library**: React 18+
-   **Language**: TypeScript
-   **3D Rendering**: `@react-three/fiber`, `@react-three/drei`, `three.js`
-   **State Management**: Zustand
-   **Build Tool**: Vite
-   **Styling**: Tailwind CSS with PostCSS & Autrefixer
-   **Genetics Engine**: `@cristianglezm/flower-evolver-wasm` (WASM package)
-   **Data Visualization**: `echarts`, `echarts-for-react`

### Initial Setup Steps:
1.  Initialize a new Vite project with the React + TypeScript template.
2.  Install all primary and development dependencies as listed in `package.json`.
3.  Configure Tailwind CSS by creating `tailwind.config.js` and `postcss.config.js`.
4.  Create a main stylesheet `src/style.css` and import it in `src/index.tsx`.

## 3. Data Model (`src/types.ts`)

Define the core data structures for the simulation state.

-   **`SimulationParams`**: A comprehensive interface for all simulation settings. This includes grid dimensions, initial actor counts, environmental factors (`humidity`, `temperature`, `wind`), and **core simulation constants** (`tickCostMultiplier`, `eggHatchTime`, etc.) to allow for easy tweaking and saving.
-   **Actor Types**: Define interfaces for each entity:
    -   `Flower`: Must include its current state (`health`, `stamina`, `age`), its genetic properties (`genome`, `imageData`, `maxHealth`, `maxStamina`, etc.), and its position.
    -   `Insect`: Includes `emoji`, position, `lifespan`, and `pollen` (tracking the genome and source ID of the last flower visited).
    -   `Bird`: Includes position and a `target` coordinate.
    -   `Nutrient`: Includes position and a `lifespan` in ticks.
    -   `Egg`: Includes position, `hatchTimer`, and the `insectEmoji` it will spawn.
-   **`Grid`**: A 2D array where each cell contains a list of actor instances (`(CellContent[])[][]`).
-   **Service Interfaces**:
    -   `FEService`: Defines the contract for the WASM service wrapper, ensuring all methods are typed correctly, especially `getFlowerStats` which returns `Promise<FlowerGenomeStats>`.
-   **State & Analytics**:
    -   `TickSummary`: A detailed object compiled by the `SimulationEngine` each tick, containing aggregated data like population counts, average genetic traits, and key events (reproductions, predations, `eggsLaid`, `insectsBorn`).
    -   `Challenge`, `ChallengeState`: Interfaces for defining user challenges and managing their persistent state in a Zustand store.
    -   `AnalyticsDataPoint`, `AnalyticsState`: Interfaces for storing a history of `TickSummary` data for visualization, also managed in a persistent Zustand store.

## 4. Configuration Management

To promote flexibility and ensure saved states are perfectly reproducible, core simulation logic parameters should not be hardcoded as constants.

-   **Centralized in `SimulationParams`**: Constants like `FLOWER_TICK_COST_MULTIPLIER`, `EGG_HATCH_TIME`, `INSECT_REPRODUCTION_CHANCE`, etc., should be properties of the `SimulationParams` object.
-   **Default Configuration**: A `DEFAULT_SIM_PARAMS` object will be defined in `src/constants.ts` to provide the initial state.
-   **Benefits**: This approach allows for easy tweaking from the UI (e.g., creating "easy" or "hard" modes) and ensures that when a state is saved and loaded, it runs with the exact same rules, preventing inconsistencies.

## 5. Core Architecture

The application's architecture is designed to separate the computationally intensive simulation from the UI, ensuring the user experience remains fluid and responsive.

### 5.1. Web Worker for Performance (`src/simulation.worker.ts`)
-   **Role**: The worker acts as a simple, robust **host** for the `SimulationEngine`. Its primary responsibility is to run on a separate thread, isolating all heavy computation from the UI.
-   **Message Broker**: It functions as a message broker, receiving commands from the UI (via the `useSimulation` hook) and forwarding them to the `SimulationEngine` instance. It then relays results from the engine (`gridUpdate`, `tick-summary`, etc.) back to the UI thread. This keeps the worker's own logic minimal, reducing the surface area for bugs.

### 5.2. The Simulation Engine & Behavior System (`src/lib/`)
-   **`SimulationEngine` (`simulationEngine.ts`)**: This class is the **orchestrator** of the simulation. Its main game loop (`calculateNextTick`) manages the simulation's state and sequence of events. It does not contain actor-specific logic itself; instead, it delegates that to the Behavior System. Its responsibilities include:
    -   Maintaining the master actor state (`grid`, `tick` count).
    -   Creating and populating the Quadtrees each tick.
    -   Iterating through actors and calling the appropriate behavior module.
    -   Handling global events like insect reproduction and nutrient healing.
    -   Compiling the `TickSummary` at the end of each tick.

-   **Behavior System (`lib/behaviors/`)**: This is a modular pattern for separating actor logic. The engine calls a dedicated function for each actor type, passing the actor's state and a `context` object with necessary global information.

    -   **`flowerBehavior`**: Manages the complete flower lifecycle.
        -   **State**: Handles aging, maturation, and energy consumption (stamina, then health).
        -   **Reproduction**: Implements all three reproduction methods:
            1.  **Asexual Expansion**: A chance to spawn a clone in an adjacent empty cell.
            2.  **Proximity Pollination**: Sexual reproduction with an adjacent, mature flower.
            3.  **Wind Pollination**: A chance to pollinate a distant flower along the wind's path.

    -   **`insectBehavior`**: Governs insect AI and its interaction with flowers.
        -   **Lifecycle**: Insects have a limited `lifespan`. Each tick, it decrements. If it reaches zero, the insect dies and is replaced by a nutrient, completing the cycle.
        -   **AI**: Uses the `flowerQtree` to find the nearest flower within its vision range and moves towards it. If no flower is found, it wanders randomly.
        -   **Interaction**: When it lands on a flower's cell, it inflicts a small amount of damage and picks up the flower's pollen (genome).
        -   **Pollination**: If it is carrying pollen and lands on a *different*, mature flower, it triggers a sexual reproduction event by calling `createNewFlower`.

    -   **`birdBehavior`**: Governs predator AI and connects the food chain.
        -   **AI**: Uses the main `qtree` to find prey. It has a target priority: it will always prefer to hunt unprotected insects, but if none are available, it will target stationary eggs.
        -   **Hunting**: Moves directly towards its target. Upon reaching the target, it "eats" it (removes the insect/egg from the simulation).
        -   **Nutrient Cycle**: After preying on an insect, it creates a nutrient-rich dropping (`💩`) on that cell. Eating an egg does not produce a nutrient.

    -   **`eggBehavior` & `nutrientBehavior`**: Simple state-machine behaviors.
        -   `eggBehavior`: Decrements a `hatchTimer`. When the timer reaches zero, it is removed and a new insect is spawned in its place.
        -   `nutrientBehavior`: Decrements a `lifespan` timer. It is removed when the timer expires. Its healing effect is handled globally by the `SimulationEngine` before its own tick is processed.

### 5.3. Performance Optimization with Quadtrees (`lib/Quadtree.ts`)
To avoid performance degradation as the number of actors grows, the `SimulationEngine` creates and populates several purpose-built Quadtrees **on every tick**. This provides highly efficient spatial lookups for different AI needs.

-   **General `qtree`**: Contains all actors. Used for broad queries, such as:
    -   Bird vision (finding any nearby, unprotected insects and eggs).
    -   Nutrient area-of-effect healing.

-   **`flowerQtree`**: Contains only flowers. This is a critical optimization used exclusively by:
    -   `insectBehavior` to allow insects to find the nearest flower target without having to scan through birds, eggs, or other insects.

-   **`insectQtree`**: Contains only insects. This tree is built and used within the `SimulationEngine`'s main loop to handle:
    -   **Insect Reproduction**: Allows an insect to efficiently find if another insect of the same species is on the same cell to initiate a reproduction event. This avoids a costly `O(n^2)` check between all insects.

### 5.4. UI/Worker Communication (`src/hooks/useSimulation.ts`)
-   **`useSimulation` Hook**: This custom hook is the sole bridge between the React UI and the simulation worker.
    -   **Responsibilities**: Manages the worker's lifecycle, sends commands (start, pause, reset), and listens for incoming messages.
    -   **State Synchronization**: When it receives a `gridUpdate` message, it updates its local `grid` state, triggering a re-render of the `SimulationView`. When it receives a `tick-summary`, it forwards the data to the appropriate Zustand stores (`challengeStore`, `analyticsStore`).

## 6. Component Architecture (`src/components/`)
-   **`App.tsx`**: Root component. Manages UI state (sidebar visibility), orchestrates the `useSimulation` hook, and handles the save/load logic on the main thread.
-   **`SimulationView.tsx`**: A pure presentation component that renders the `grid` state onto an HTML5 canvas. It also handles click events to report selected flowers.
-   **`Controls.tsx`**: The UI for all `SimulationParams`, allowing users to configure and reset the simulation.
-   **`FlowerDetailsPanel.tsx`**: Displays detailed data for a selected flower, including stats, genome, and a button to launch the 3D viewer.
-   **`Flower3DViewer.tsx`**: Renders a flower's 3D model using `@react-three/fiber` inside a modal.
-   **`DataPanel.tsx`**: A slide-out panel with a tabbed interface for switching between `ChallengesPanel` and `ChartsPanel`.
-   **`ChallengesPanel.tsx`**: Subscribes to `challengeStore` and displays challenge progress.
-   **`ChartsPanel.tsx`**: Subscribes to `analyticsStore` and renders visualizations of the simulation's history.
-   **Global State (Zustand Stores)**:
    -   `toastStore`: Manages UI notifications.
    -   `challengeStore` & `analyticsStore`: Use `persist` middleware to save progress and historical data to `localStorage`.

## 7. Error Handling and Resilience
-   **WASM Initialization Failure**: Both the main thread's `flowerService` and the worker's instance must handle potential failures during the `initialize()` call. If it fails, the application should display a clear, user-friendly error message and not attempt to start the simulation. A timeout should be used to prevent the app from hanging indefinitely.
-   **Worker Errors**: The `useSimulation` hook should attach an `onerror` handler to the worker instance. If the worker terminates unexpectedly, the UI should be notified, the simulation should be shown as paused, and an error message should be displayed.

## 8. Accessibility (A11y)
-   **Canvas Accessibility**: The primary simulation view on the canvas is not inherently accessible. To mitigate this:
    -   Key events (e.g., a flower being pollinated, an insect being eaten) announced via the toast system should be placed in an `aria-live` region so screen readers can announce them.
-   **UI Controls**: All interactive UI elements (buttons, sliders, tabs, modals) must be fully keyboard-navigable and have appropriate ARIA attributes (`aria-label`, `aria-valuenow`, `aria-selected`, `role`, etc.).

## 9. Testing & Developer Experience
-   **Unit & Component Testing**: Use Vitest and React Testing Library. Isolate logic in hooks and behavior modules for easier testing. Mock dependencies like the `flowerService` and the Web Worker itself in tests.
-   **E2E Testing**: Use Playwright to test full user flows, including starting/pausing the simulation, changing parameters, and interacting with panels.
-   **Automatic React DevTools**: A custom Vite plugin will be used to automatically launch the standalone React DevTools application and inject its connection script, providing a zero-config debugging experience for developers.
