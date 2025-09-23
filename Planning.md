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

-   **`SimulationParams`**: A comprehensive interface for all simulation settings. This includes grid dimensions, initial actor counts, and **core simulation constants** (`tickCostMultiplier`, `eggHatchTime`, etc.) to allow for easy tweaking and saving. It also includes the `notificationMode` to control the event system. This has been expanded to include a full suite of **dynamic weather parameters**: `seasonLengthInTicks`, `temperatureAmplitude`, `humidityAmplitude`, and settings for random weather events like `weatherEventChance` and temperature/humidity modifiers.
-   **Actor Types**: Define interfaces for each entity:
    -   `Flower`: Must include its current state (`health`, `stamina`, `age`), its genetic properties (`genome`, `imageData`, `maxHealth`, `maxStamina`, `toxicityRate` etc.), and its position.
    -   `FlowerSeed`: A lightweight placeholder for a flower that is being generated asynchronously in the background. Includes position, `health`, `maxHealth`, and a placeholder `imageData` for the stem.
    -   `Insect`: Includes `emoji`, position, `lifespan`, and `pollen` (tracking the genome and source ID of the last flower visited).
    -   `Bird`: Includes position and a `target` coordinate.
    -   `Eagle`: Includes position and a `target` coordinate (for a bird).
    -   `HerbicidePlane`: Includes position, a `path` vector, and an `end` coordinate.
    -   `HerbicideSmoke`: Includes position, a `lifespan`, and a `canBeExpanded`.
    -   `Nutrient`: Includes position and a `lifespan` in ticks.
    -   `Egg`: Includes position, `hatchTimer`, and the `insectEmoji` it will spawn.
-   **`Grid`**: A 2D array where each cell contains a list of actor instances (`(CellContent[])[][]`).
-   **Service Interfaces**:
    -   `FEService`: Defines the contract for the WASM service wrapper, ensuring all methods are typed correctly, especially `getFlowerStats` which returns `Promise<FlowerGenomeStats>`.
-   **Environment Types**:
    -   `Season`, `WeatherEventType`, `WeatherEvent`: Enums and interfaces to model the four seasons and random weather events (heatwave, cold snap, etc.).
    -   `EnvironmentState`: An object to hold the current environmental conditions of the simulation (`currentTemperature`, `currentHumidity`, `season`, `currentWeatherEvent`).
-   **State & Analytics**:
    -   `TickSummary`: A detailed object compiled by the `SimulationEngine` each tick, containing aggregated data like population counts, average genetic traits, key events (reproductions, predations, `eggsLaid`, `insectsBorn`), and `tickTimeMs` for performance analysis. It now also includes the current environmental state (`currentTemperature`, `season`, etc.).
    -   `Challenge`, `ChallengeState`: Interfaces for defining user challenges and managing their persistent state in a Zustand store. Examples include survival challenges (max flower age), predation (total insects eaten), population milestones (max insect count), and genetic achievements (max toxicity).
    -   `AnalyticsDataPoint`, `AnalyticsState`: Interfaces for storing a history of `TickSummary` data for visualization, also managed in a persistent Zustand store. This now includes environmental data to power the new Environment chart.
    -   **`SeedBankEntry`**: Interface for storing champion flowers in IndexedDB, containing the `category` ('longestLived', 'mostToxic', 'mostHealing'), `genome`, achievement `value`, a rendered `imageData`, and `sex`.
-   **Events & Notifications**:
    -   `AppEvent`: A structured object for all events within the simulation, containing a `message`, `type`, `importance`, and optionally the `tick` it occurred on and a `timestamp`.
    -   `LogEntry`: The object stored in the `eventLogStore`, extending `AppEvent` with a unique ID.

## 4. Configuration Management

To promote flexibility and ensure saved states are perfectly reproducible, core simulation logic parameters should not be hardcoded as constants.

-   **Centralized in `SimulationParams`**: Constants like `FLOWER_TICK_COST_MULTIPLIER`, `EGG_HATCH_TIME`, `INSECT_REPRODUCTION_CHANCE`, etc., should be properties of the `SimulationParams` object.
-   **Default Configuration**: A `DEFAULT_SIM_PARAMS` object will be defined in `src/constants.ts` to provide the initial state.
-   **Benefits**: This approach allows for easy tweaking from the UI (e.g., creating "easy" or "hard" modes) and ensures that when a state is saved and loaded, it runs with the exact same rules, preventing inconsistencies.

## 5. Core Architecture

The application's architecture is designed to separate the computationally intensive simulation from the UI, ensuring the user experience remains fluid and responsive.

### 5.1. Dual-Worker Architecture for Performance
The simulation is split across two Web Workers to ensure the UI remains responsive and the simulation tick rate is consistent, even during heavy computation.
-   **`simulation.worker.ts` (The Simulation Host)**: This worker is the primary owner of the simulation state.
    -   **Role**: It hosts the `SimulationEngine` and runs the main game loop (`setInterval`). Its sole responsibility is to manage the simulation's state progression, tick by tick.
    -   **Communication**: It communicates with the UI thread via `postMessage`, sending batches of state changes (deltas), events, and tick summaries. It communicates with the `flower.worker.ts` via a dedicated `MessageChannel`.

-   **`flower.worker.ts` (The Genetics Worker)**: This worker is a specialized offload thread for expensive WASM operations.
    -   **Role**: It owns the instance of the `FEService` (the WASM wrapper). Its only job is to receive requests for new flower creation (initial, mutation, or reproduction), execute the slow, asynchronous WASM functions, and send the completed flower data back.
    -   **Benefit**: By isolating WASM calls here, the main simulation loop in the `simulation.worker.ts` is **never blocked**. It can continue ticking at a consistent rate while new flowers are being generated in the background.

-   **Asynchronous Flower Creation Pipeline**:
    1.  When the `SimulationEngine` determines a new flower should be created, it doesn't call the WASM service directly. Instead, it creates a lightweight `FlowerSeed` placeholder actor.
    2.  It sends a `request-flower` message to the `flower.worker.ts` via the `MessageChannel`. This message includes the necessary data (parent genomes, coordinates) and a unique `requestId` (which is the ID of the `FlowerSeed` placeholder).
    3.  The `simulation.worker.ts` continues its tick without waiting.
    4.  The `flower.worker.ts` receives the request, performs the expensive `reproduce()` or `makeFlower()` call, and waits for the WASM module to complete.
    5.  Once the new flower's data (genome, stats, image) is ready, the `flower.worker.ts` sends a `flower-created` message back to the `simulation.worker.ts`, including the original `requestId`.
    6.  The `simulation.worker.ts` receives this message and places the completed flower data into a `completedFlowersQueue`.
    7.  At the beginning of the next tick, the `SimulationEngine` processes this queue, finds the `FlowerSeed` with the matching ID, removes it, and adds the new, fully-formed `Flower` in its place.

### 5.2. The Simulation Engine & Behavior System (`src/lib/`)
-   **`SimulationEngine` (`simulationEngine.ts`)**: This class is the **orchestrator** of the simulation. Its main game loop (`calculateNextTick`) manages the simulation's state and sequence of events. Instead of returning the entire grid state, it now calculates a minimal set of "delta" updates (e.g., actor added, removed, or properties changed) which are sent to the UI for efficient state synchronization. It does not contain actor-specific logic itself; instead, it delegates that to the Behavior System. Its responsibilities include:
    -   Maintaining the master actor state (`grid`, `tick` count).
    -   **Managing the Dynamic Environment**: At the start of each tick, it updates the `EnvironmentState` by calculating the current season based on a sinusoidal wave and determining if a random weather event (e.g., heatwave, cold snap) should occur.
    -   **Champion Tracking**: Checks every flower that dies against current records for longest lifespan and highest toxicity/healing. If a new record is set, it saves the flower's genome and a rendered image to the persistent Seed Bank (IndexedDB).
    -   Creating and populating the Quadtrees each tick.
    -   Iterating through actors and calling the appropriate behavior module, passing the current `EnvironmentState`.
    -   Handling global events like insect reproduction and nutrient healing.
    -   **Requesting new flowers** via the asynchronous worker pipeline.
    -   **Processing the `completedFlowersQueue`** at the start of each tick to replace seeds with full flowers.
    -   Collecting all `AppEvent` objects generated by behaviors during a tick.
    -   Compiling the `TickSummary` at the end of each tick.
    -   Measuring the execution time of each tick for performance monitoring.

-   **Behavior System (`lib/behaviors/`)**: This is a modular pattern for separating actor logic. The engine calls a dedicated function for each actor type, passing the actor's state and a `context` object with necessary global information. Crucially, behaviors no longer create UI notifications directly; they now push structured `AppEvent` objects into the context's `events` array.

    -   **`flowerBehavior`**: Manages the complete flower lifecycle.
        -   **Environmental Stress**: The `processFlowerTick` function now uses the `currentTemperature` from the context. If the temperature is outside the flower's genetically determined `minTemperature`/`maxTemperature` range, its stamina cost for that tick is doubled.
        -   **State**: Handles aging, maturation, and energy consumption (stamina, then health).
        -   **Reproduction**: Implements all three reproduction methods: Asexual Expansion, Proximity Pollination, and Wind Pollination.

    -   **`insectBehavior`**: Governs insect AI and its interaction with flowers.
        -   **Dormancy**: The `processInsectTick` function now checks the `currentTemperature` from the context. If it is below a certain threshold (`INSECT_DORMANCY_TEMP`), the function returns immediately, causing the insect to skip its turn and effectively become dormant.
        -   **Toxicity/Healing Interaction**: When an insect lands on a flower, it checks the flower's `toxicityRate`. If the rate is negative (healing), the insect's lifespan is extended. If the rate is above a positive threshold (toxic/carnivorous), the insect's lifespan is reduced. Otherwise, the insect damages the flower as normal.
        -   **Lifecycle**: Insects have a limited `lifespan`. Each tick, it decrements. If it reaches zero, the insect dies and is replaced by a nutrient.
        -   **AI**: Uses the `flowerQtree` to find the nearest flower and moves towards it, with a degree of randomness to prevent unnatural swarming.
        -   **Pollination**: If it is carrying pollen and lands on a *different*, mature flower, it triggers a sexual reproduction event.

    -   **`birdBehavior`**: Governs predator AI and connects the food chain.
        -   **AI**: Uses the main `qtree` to find prey (unprotected insects or eggs). When not actively hunting, it implements a **patrolling AI**, selecting a random flower as a temporary destination.
        -   **Hunting**: Moves directly towards its target. Upon reaching the target, it "eats" it.
        -   **Nutrient Cycle**: After preying on an insect, it creates a nutrient-rich dropping.
    
    -   **`eagleBehavior`**: The apex predator, spawned as a regulatory mechanism.
        -   **AI**: Uses the main `qtree` to find the nearest bird.
        -   **Hunting**: Moves directly towards its target. Upon reaching the target, it "eats" it and is immediately removed from the simulation.
        -   **Lifecycle**: Eagles are transient actors. If they cannot find a target, they despawn.

    -   **`herbicidePlaneBehavior`**: The plane follows a simple, deterministic path.
        -   **Movement**: Spawns at a random edge and moves in a straight line towards the opposite edge.
        -   **Action**: At each cell on its path, it drops a single `HerbicideSmoke` actor.
        -   **Lifecycle**: Removed from the simulation once it moves past its destination.

    -   **`herbicideSmokeBehavior`**: A temporary, damaging area-of-effect entity.
        -   **Damage**: Each tick, it applies damage to any flowers in its current cell.
        -   **Expansion**: On its first tick, it expands by creating new smoke actors in adjacent cells.
        -   **Lifecycle**: It has a short `lifespan` and is removed when the timer expires.

    -   **`eggBehavior` & `nutrientBehavior`**: Simple state-machine behaviors.
        -   `eggBehavior`: Decrements a `hatchTimer`. When the timer reaches zero, it is removed and a new insect is spawned.
        -   `nutrientBehavior`: Decrements a `lifespan` timer. It is removed when the timer expires.

-   **Dynamic Population Control**: To create a more resilient and self-regulating ecosystem, the `SimulationEngine` actively monitors population trends.
    -   **Trend Analysis**: It maintains a history of insect population counts over a recent window of ticks.
    -   **Predator Spawning**: If the insect population's growth rate exceeds a threshold, a new **bird** is spawned.
    -   **Apex Predator Intervention**: If the insect population is declining too rapidly, an **eagle** is spawned to hunt a single bird.
    -   **Cooldowns**: Spawning events are subject to cooldowns to prevent chaotic fluctuations.

-   **Herbicide Control**: To prevent "flower deadlock," an `HerbicidePlane` is deployed if the flower density exceeds a configured threshold.

-   **Spring Repopulation**: To prevent total ecosystem collapse, the engine checks for the transition from Winter to Spring. If either the flower or insect populations are at zero, it repopulates. If the Seed Bank contains champion genomes, they are used to create new flowers; otherwise, new random flowers are spawned.

### 5.3. Performance Optimization with Quadtrees (`lib/Quadtree.ts`)
To avoid performance degradation as the number of actors grows, the `SimulationEngine` creates and populates several purpose-built Quadtrees **on every tick**. This provides highly efficient spatial lookups for different AI needs.

-   **General `qtree`**: Contains all actors.
-   **`flowerQtree`**: Contains only flowers, used by insects and idle birds.
-   **`insectQtree`**: Contains only insects, used for efficient reproduction checks.

### 5.4. UI/Worker Communication (`src/hooks/useSimulation.ts`)
-   **`useSimulation` Hook**: This custom hook is the sole bridge between the React UI and the simulation worker.
    -   **Responsibilities**: Manages the lifecycle of both workers, establishes the `MessageChannel` between them, sends commands (start, pause, reset) to the simulation worker, and listens for incoming messages.
    -   **State Synchronization**: When it receives a 'tick-update' message, it efficiently processes an array of deltas to reconstruct the new grid state. It then forwards the tick summary to the analytics and challenge stores and sends all new events to the EventService.

### 5.5. Centralized Event & Notification System
-   **`eventService.ts`**: A singleton service on the main thread that acts as a central hub for all notifications.
-   **Decoupling**: The simulation engine and its behaviors simply generate and return an array of `AppEvent` objects each tick.
-   **Routing Logic**: Based on the user's `notificationMode` setting and the event's `importance`, the service decides whether to send the event to the `eventLogStore`, the `toastStore`, or both.

## 6. Component Architecture (`src/components/`)
-   **`App.tsx`**: Root component. Manages UI state, orchestrates the `useSimulation` hook, and handles save/load logic.
-   **`SimulationView.tsx`**: Hosts the rendering engine's canvases and forwards user clicks.
-   **`Controls.tsx`**: The UI for all `SimulationParams`, including new sliders and inputs for configuring the dynamic weather system (season length, temperature/humidity variation, etc.).
-   **`FlowerDetailsPanel.tsx`**: Displays detailed data for a selected flower.
-   **`Flower3DViewer.tsx`**: Renders a flower's 3D model using `@react-three/fiber`.
-   **`DataPanel.tsx`**: A slide-out panel with a tabbed interface for `ChallengesPanel`, `ChartsPanel`, and `SeedBankPanel`.
-   **`ChartsPanel.tsx`**: Subscribes to `analyticsStore` and renders visualizations, including a new **Environment chart** showing the history of temperature and humidity.
-   **`SeedBankPanel.tsx`**: Subscribes to the IndexedDB-based Seed Bank. Displays saved champion flowers with their stats and rendered image. Provides functionality to view a champion in 3D, download its genome, and clear the entire Seed Bank.
-   **Header Components**:
    -   `EnvironmentDisplay`: A new real-time display in the header showing the current season, temperature, humidity, and any active weather events.
    -   `EventLog.tsx`: A non-intrusive, terminal-style log that displays a real-time feed of events.
-   **Notification Components**:
    -   `FullEventLogPanel.tsx`: A large, slide-out side panel that displays the full, scrollable history of events.
    -   `Toast.tsx` & `ToastContainer.tsx`: Render pop-up notifications.
-   **Global State (Zustand Stores)**:
    -   `eventLogStore`: Manages the state for the `EventLog`.
    -   `toastStore`: Manages UI notifications for high-importance events.
    -   `challengeStore` & `analyticsStore`: Use `persist` middleware to save progress and historical data to `localStorage`.

## 7. Error Handling and Resilience
-   **WASM Initialization Failure**: Both the main thread and worker instances must handle potential failures during `initialize()`, display a clear error message, and use a timeout to prevent the app from hanging.
-   **Worker Errors**: The `useSimulation` hook should attach an `onerror` handler to the worker. If the worker terminates unexpectedly, the UI should be notified and the simulation shown as paused.

## 8. Accessibility (A11y)
-   **Canvas Accessibility**: Key events are made available in the text-based `FullEventLogPanel`. The `ToastContainer` is an `aria-live` region.
-   **UI Controls**: All interactive UI elements must be fully keyboard-navigable and have appropriate ARIA attributes.

## 9. Testing & Developer Experience
-   **Unit & Component Testing**: Use Vitest and React Testing Library. Mock dependencies like the `flowerService` and the Web Worker.
-   **E2E Testing**: Use Playwright to test full user flows.
-   **Automatic React DevTools**: A custom Vite plugin automatically launches the standalone React DevTools application.

## 10. Project Structure
-   `index.html`: The single-page entry point. It contains the `<div id="root">` where the React app is mounted.
-   `package.json`: Defines project metadata, scripts (`dev`, `build`), and dependencies.
-   `vite.config.ts`, `tailwind.config.js`, `postcss.config.js`: Configuration files for the Vite build tool and the Tailwind CSS styling pipeline.
-   `src/`: Contains all the application source code.
    -   `src/index.tsx`: The main entry point for the React application.
    -   `src/App.tsx`: The root React component. Manages global state and layout.
    -   `src/hooks/useSimulation.ts`: **Simulation Manager.** A custom hook that acts as a bridge to the simulation's Web Worker, managing its lifecycle and communication.
    -   `src/simulation.worker.ts`: **Simulation Host.** This Web Worker runs on a separate thread and acts as a message broker between the main UI thread and the simulation logic. It's primary role is to host the `SimulationEngine` to prevent the UI from freezing during heavy calculations.
    -   `src/flower.worker.ts`: **Genetics Worker.** A dedicated worker that handles all expensive, asynchronous calls to the WASM genetics module, ensuring the simulation worker is never blocked.
    -   `src/lib/simulationEngine.ts`: **The heart of the simulation.** This class contains the main simulation loop (`calculateNextTick`), all state management (the grid, actors), and orchestrates actor logic. It is instantiated and run exclusively within the web worker.
    -   `src/lib/behaviors/`: Contains individual behavior modules for each actor type (`birdBehavior`, `insectBehavior`, etc.). These modules are called by the `SimulationEngine` to process each actor's logic for a given tick, promoting a clean separation of concerns.
    -   `src/lib/renderingEngine.ts`: A dedicated class for managing the two-canvas rendering system, including change detection and drawing logic.
    -   `src/lib/Quadtree.ts`: A generic Quadtree data structure for efficient 2D spatial queries.
    -   `src/components/SimulationView.tsx`: Hosts the two stacked canvas elements and orchestrates the `RenderingEngine`.
    -   `src/components/Controls.tsx`: UI for changing simulation parameters.
    -   `src/components/FlowerDetailsPanel.tsx`: UI that displays the stats of the selected flower. It handles pausing the simulation when its "View in 3D" button is clicked.
    -   `src/components/Flower3DViewer.tsx`: A React-Three-Fiber component that renders the 3D flower model.
    -   `src/components/Modal.tsx`: A generic modal component.
    -   `src/components/DataPanel.tsx`: The main UI for the slide-out panel containing challenges, analytics, and the Seed Bank, with a tabbed interface.
    -   `src/components/ChallengesPanel.tsx`: Renders the list of challenges and their progress from the `challengeStore`.
    -   `src/components/ChartsPanel.tsx`: Renders all the data visualization charts using data from the `analyticsStore`.
    -   `src/components/Chart.tsx`: A reusable wrapper component for the `echarts-for-react` library.
    -   `src/components/SeedBankPanel.tsx`: Renders the champion flowers saved in the Seed Bank. Allows users to view a 3D model of the champions, download their genomes, and clear the database.
    -   `src/components/Toast.tsx`: Renders a single toast notification with a message and icon.
    -   `src/components/ToastContainer.tsx`: Manages the on-screen layout and rendering of all active toasts.
    -   `src/services/flowerService.ts`: A TypeScript singleton wrapper for the WASM module.
    -   `src/stores/toastStore.ts`: A global Zustand store for managing toast notifications.
    -   `src/stores/challengeStore.ts`: A Zustand store with `persist` middleware for tracking challenge progress across sessions.
    -   `src/stores/analyticsStore.ts`: A Zustand store with `persist` middleware for storing historical simulation data for the charts.
    -   `src/utils.ts`: A module for shared utility functions.
    -   `src/constants.ts`: Global constants for the simulation (tick rate, damage values, etc.).
    -   `src/types.ts`: Shared TypeScript types for the simulation.
