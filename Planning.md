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
    -   `Insect`: Includes `emoji`, position, `health`, `maxHealth`, `stamina`, `maxStamina`, a genetic `genome` that dictates its flower preferences, a `reproductionCooldown`, and `pollen` (tracking the genome and source ID of the last flower visited). `lifespan` is kept for backward compatibility with older save files.
    -   `InsectStats`: A new interface defining the base stats for each insect type (`attack`, `maxHealth`, `maxStamina`, `speed`, `role`, `eggHatchTime`, `reproductionCost`).
    -   `Bird`: Includes position and a `target` coordinate.
    -   `Eagle`: Includes position and a `target` coordinate (for a bird).
    -   `HerbicidePlane`: Includes position, a `path` vector, and an `end` coordinate.
    -   `HerbicideSmoke`: Includes position, a `lifespan`, and a `canBeExpanded`.
    -   `Nutrient`: Includes position and a `lifespan` in ticks.
    -   `Egg`: Includes position, `hatchTimer`, the `insectEmoji` it will spawn, and the `genome` inherited from its parents.
    -   `Corpse`: Includes position, `originalEmoji`, and a `decayTimer` in ticks.
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
    1.  When the `SimulationEngine` or a behavior module determines a new flower should be created, it calls the `AsyncFlowerFactory`.
    2.  The factory sends a `request-flower` message to the `flower.worker.ts` via the `MessageChannel`. This message includes the necessary data (parent genomes, coordinates) and a unique `requestId`. It immediately returns a lightweight `FlowerSeed` placeholder actor.
    3.  The `simulation.worker.ts` continues its tick without waiting.
    4.  The `flower.worker.ts` receives the request, performs the expensive `reproduce()` or `makeFlower()` call, and waits for the WASM module to complete.
    5.  Once the new flower's data (genome, stats, image) is ready, the `flower.worker.ts` sends a `flower-created` message back to the `simulation.worker.ts`, including the original `requestId`.
    6.  The `AsyncFlowerFactory` on the simulation worker thread receives this message and places the completed flower data into its internal queue.
    7.  At the beginning of the next tick, the `SimulationEngine` asks the factory for completed flowers. The factory processes its queue, finds the `FlowerSeed` with the matching ID, removes it, and returns the new, fully-formed `Flower`.

### 5.2. The Simulation Engine & Behavior System (`src/lib/`)
-   **`SimulationEngine` (`simulationEngine.ts`)**: This class acts as a high-level **orchestrator** for the simulation. Its main loop (`calculateNextTick`) coordinates the different managers and systems, but contains very little logic itself. Its core responsibilities are:
    -   Maintaining the master actor state (`grid`, `tick` count).
    -   Updating the environment (weather & seasons).
    -   Building Quadtrees for efficient spatial querying.
    -   Delegating global behaviors (nutrient healing, insect reproduction) to the `EcosystemManager`.
    -   Iterating through actors and calling their individual behavior modules.
    -   Calculating a `TickSummary` of the current state.
    -   Passing the summary to the `PopulationManager` and adding any new actors it returns.
    -   Processing completed flowers returned by the `AsyncFlowerFactory`.
    -   Calculating a minimal set of state changes ("deltas") to send to the UI.

-   **`PopulationManager`**: Encapsulates all logic related to ecosystem balance and dynamic population control.
    -   **Role**: To create a self-regulating system by monitoring population trends and intervening to prevent ecological collapse.
    -   **Responsibilities**:
        -   Maintains a history of insect and bird populations over a recent window of ticks.
        -   Analyzes trends to determine if populations are 'growing', 'declining', or 'stable'.
        -   Based on trends, it may return new actors to be added to the simulation:
            -   Spawns a **bird** if the insect population is booming.
            -   Spawns an **eagle** if the insect population is crashing (to control the bird population).
            -   Spawns a **herbicide plane** if flower density becomes too high.
        -   Manages cooldowns for all spawning events to prevent chaotic fluctuations.
-   **`AsyncFlowerFactory`**: Handles all asynchronous communication with the `flower.worker.ts`.
    -   **Role**: To completely decouple expensive, blocking WASM genetics calls from the main simulation loop.
    -   **Responsibilities**:
        -   Receives requests for new flowers from the simulation engine or behavior modules.
        -   Creates a lightweight `FlowerSeed` placeholder and returns it immediately.
        -   Manages the communication queue with the genetics worker.
        -   Provides a list of fully-formed `Flower` objects back to the engine once they have been computed.
-   **`EcosystemManager`**: A module for global, system-wide behaviors.
    -   **Role**: To group functions that operate on the entire actor state rather than a single actor, cleaning up the main engine loop.
    -   **Responsibilities**:
        -   `processNutrientHealing`: Scans for all nutrients and applies their healing effect to nearby flowers.
        -   `handleInsectReproduction`: Scans for pairs of insects of the same species on the same cell, initiating reproduction. It handles the creation of a new `Egg` with a `genome` created by crossing over the parents' genomes with a chance of mutation, then puts the parents on a `reproductionCooldown`.

-   **Behavior System (`lib/behaviors/`)**: This is a modular pattern for separating actor logic. The engine calls a dedicated function for each actor type, passing the actor's state and a `context` object with necessary global information. Crucially, behaviors no longer create UI notifications directly; they now push structured `AppEvent` objects into the context's `events` array.

    -   **`flowerBehavior`**: Manages the complete flower lifecycle.
        -   **Environmental Stress**: The `processFlowerTick` function now uses the `currentTemperature` from the context. If the temperature is outside the flower's genetically determined `minTemperature`/`maxTemperature` range, its stamina cost for that tick is doubled.
        -   **State**: Handles aging, maturation, and energy consumption (stamina, then health).
        -   **Reproduction**: Implements all three reproduction methods: Asexual Expansion, Proximity Pollination, and Wind Pollination.

    -   **`insectBehavior`**: A dispatcher that routes to specialized behaviors.
        -   **`DefaultInsectBehavior`**: Governs standard insect AI (pollinators, attackers, etc.), including genetic-based flower targeting, pollination, and dormancy.
        -   **`CockroachBehavior`**: Manages scavenger AI. Cockroaches hunt for `Corpse` actors. If none are found, they will attack weak flowers. They produce a low-quality nutrient upon eating.

    -   **`birdBehavior`**: Governs predator AI and connects the food chain.
        -   **AI**: Uses the main `qtree` to find prey (unprotected insects or eggs). When not actively hunting, it implements a **patrolling AI**, selecting a random flower as a temporary destination.
        -   **Hunting**: Moves directly towards its target. Upon reaching the target, it "eats" it.
        -   **Nutrient Cycle**: After preying on an insect, it creates a nutrient-rich dropping. The eaten insect does not leave a corpse and is instead converted directly into a nutrient.
    
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

    -   **`eggBehavior`, `nutrientBehavior`, & `corpseBehavior`**: Simple state-machine behaviors.
        -   `eggBehavior`: Decrements a `hatchTimer`. When the timer reaches zero, it is removed and a new insect is spawned.
        -   `nutrientBehavior`: Decrements a `lifespan` timer. It is removed when the timer expires.
        -   `corpseBehavior`: Decrements a `decayTimer`. When the timer expires, it is removed and replaced by a `Nutrient`.

-   **Spring Repopulation**: To prevent total ecosystem collapse, the engine checks for the transition from Winter to Spring. If either the flower or insect populations are at zero, it repopulates. If the Seed Bank contains champion genomes, they are used to create new flowers; otherwise, new random flowers are spawned.

### 5.3. Performance Optimization with Quadtrees (`lib/Quadtree.ts`)
To avoid performance degradation as the number of actors grows, the `SimulationEngine` creates and populates several purpose-built Quadtrees **on every tick**. This provides highly efficient spatial lookups for different AI needs.

-   **General `qtree`**: Contains all actors.
-   **`flowerQtree`**: Contains only flowers, used by insects and idle birds.
-   **`insectQtree`**: Contains only insects, used for efficient reproduction checks.

### 5.4. UI/Worker Communication & State Management Hooks (`src/hooks/`)
-   **`useSimulation` Hook**: This custom hook is the sole bridge between the React UI and the simulation worker.
    -   **Responsibilities**: Manages the lifecycle of both workers, establishes the `MessageChannel` between them, sends commands (start, pause, reset) to the simulation worker, and listens for incoming messages.
    -   **State Synchronization**: When it receives a 'tick-update' message, it efficiently processes an array of deltas to reconstruct the new grid state. It then forwards the tick summary to the analytics and challenge stores and sends all new events to the EventService.
-   **`useActorTracker` Hook**: A reusable hook that encapsulates the logic for tracking a specific actor.
    -   **Responsibilities**: Manages the ID of the tracked actor, handles starting and stopping the tracking mode, and ensures the simulation continues to run while tracking is active. It also synchronizes the `selectedActor` state to keep the UI panel updated with the tracked actor's latest data. This hook is primarily consumed by the `GlobalSearch` component and the individual actor details panels to provide a cohesive tracking experience.

### 5.5. Centralized Event & Notification System
-   **`eventService.ts`**: A singleton service on the main thread that acts as a central hub for all notifications.
-   **Decoupling**: The simulation engine and its behaviors simply generate and return an array of `AppEvent` objects each tick.
-   **Routing Logic**: Based on the user's `notificationMode` setting and the event's `importance`, the service decides whether to send the event to the `eventLogStore`, the `toastStore`, or both.

## 6. Component Architecture (`src/components/`)
-   **`App.tsx`**: Root component. Manages UI state, orchestrates the `useSimulation` and `useActorTracker` hooks, and handles save/load logic.
-   **`SimulationView.tsx`**: Hosts the rendering engine's canvases and forwards user clicks.
-   **`Controls.tsx`**: The UI for all `SimulationParams`, including new sliders and inputs for configuring the dynamic weather system (season length, temperature/humidity variation, etc.).
-   **`ActorSelectionPanel.tsx`**: A panel that appears when a user clicks a cell containing multiple actors, allowing them to choose which one to inspect.
-   **`FlowerDetailsPanel.tsx`**: Displays detailed data for a selected flower. Includes a "Track" button that utilizes the `useActorTracker` hook.
-   **`InsectDetailsPanel.tsx`**: Displays detailed data for a selected insect or cockroach. Includes a "Track" button that utilizes the `useActorTracker` hook.
-   **`EggDetailsPanel.tsx`**: A simple panel showing the time remaining until an egg hatches and what type of insect it will become. Includes a "Track" button that utilizes the `useActorTracker` hook.
-   **`GenericActorDetailsPanel.tsx`**: A fallback panel that displays basic information for any other actor type (birds, nutrients, etc.). Includes a "Track" button that utilizes the `useActorTracker` hook.
-   **`Flower3DViewer.tsx`**: Renders a flower's 3D model using `@react-three/fiber`.
-   **`DataPanel.tsx`**: A slide-out panel with a tabbed interface for `ChallengesPanel`, `ChartsPanel`, and `SeedBankPanel`.
-   **`ChartsPanel.tsx`**: Subscribes to `analyticsStore` and renders visualizations, including a new **Environment chart** showing the history of temperature and humidity.
-   **`SeedBankPanel.tsx`**: Subscribes to the IndexedDB-based Seed Bank. Displays saved champion flowers with their stats and rendered image. Provides functionality to view a champion in 3D, download its genome, and clear the entire Seed Bank.
-   **Header Components**:
    -   `StatusPanel.tsx`: A new container component in the header that orchestrates the `EnvironmentDisplay`, `WorkerStatusDisplay`, `EventLog`, and the `GlobalSearch` widget.
    -   `GlobalSearch.tsx`: A header widget that allows users to find any actor by its ID. It uses a Trie for efficient prefix-based searching, pauses the simulation during search, and communicates with the `App` component to highlight (select) or track the chosen actor.
    -   `EnvironmentDisplay`: A new real-time display in the header showing the current season, temperature, humidity, and any active weather events.
    -   `WorkerStatusDisplay.tsx`: A new real-time display in the status bar showing the number of pending genetics tasks in the `flower.worker.ts`.
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
    -   `src/hooks/useActorTracker.ts`: **Actor Tracking.** A custom hook that contains the logic for selecting and following a specific actor in real-time.
    -   `src/simulation.worker.ts`: **Simulation Host.** This Web Worker runs on a separate thread and acts as a message broker between the main UI thread and the simulation logic. It's primary role is to host the `SimulationEngine` to prevent the UI from freezing during heavy calculations.
    -   `src/flower.worker.ts`: **Genetics Worker.** A dedicated worker that handles all expensive, asynchronous calls to the WASM genetics module, ensuring the simulation worker is never blocked.
    -   `src/lib/simulationEngine.ts`: **Simulation Orchestrator.** This class acts as a high-level orchestrator for the simulation's main loop, delegating tasks to specialized managers.
    -   `src/lib/PopulationManager.ts`: **Ecosystem Balancing.** This class encapsulates all logic related to population control. It tracks population histories, manages cooldowns, and decides when to introduce new birds, eagles, or herbicide planes.
    -   `src/lib/AsyncFlowerFactory.ts`: **Asynchronous Genetics.** Manages all communication with the `flower.worker.ts`, handling the creation of new flowers without blocking the simulation.
    -   `src/lib/EcosystemManager.ts`: A module that contains functions for system-wide behaviors like nutrient healing and **insect reproduction**, which includes genetic crossover and mutation logic for offspring.
    -   `src/lib/behaviors/`: Contains individual behavior modules for each actor type (`birdBehavior`, `insectBehavior`, etc.). These modules are called by the `SimulationEngine` to process each actor's logic for a given tick, promoting a clean separation of concerns.
    -   `src/lib/renderingEngine.ts`: A dedicated class for managing the two-canvas rendering system, including change detection and drawing logic.
    -   `src/lib/Quadtree.ts`: A generic Quadtree data structure for efficient 2D spatial queries.
    -   `src/lib/Trie.ts`: A generic Trie data structure for efficient prefix-based string searching, used by the `GlobalSearch` component.
    -   `src/components/SimulationView.tsx`: Hosts the two stacked canvas elements and orchestrates the `RenderingEngine`.
    -   `src/components/Controls.tsx`: UI for changing simulation parameters.
    -   `src/components/ActorSelectionPanel.tsx`: A panel that appears when a user clicks a cell containing multiple actors.
    -   `src/components/FlowerDetailsPanel.tsx`: UI that displays the stats of the selected flower. It handles pausing the simulation when its "View in 3D" button is clicked and includes a button to initiate tracking.
    -   `src/components/InsectDetailsPanel.tsx`: UI that displays the stats of the selected insect.
    -   `src/components/EggDetailsPanel.tsx`: UI that displays info about a selected egg.
    -   `src/components/GenericActorDetailsPanel.tsx`: A fallback UI for displaying info about other actors.
    -   `src/components/Flower3DViewer.tsx`: A React-Three-Fiber component that renders the 3D flower model.
    -   `src/components/Modal.tsx`: A generic modal component.
    -   `src/components/DataPanel.tsx`: The main UI for the slide-out panel containing challenges, analytics, and the Seed Bank, with a tabbed interface.
    -   `src/components/ChallengesPanel.tsx`: Renders the list of challenges and their progress.
    -   `src/components/ChartsPanel.tsx`: Renders all the data visualization charts using data from the `analyticsStore`.
    -   `src/components/Chart.tsx`: A reusable wrapper component for the `echarts-for-react` library.
    -   `src/components/SeedBankPanel.tsx`: Renders the champion flowers saved in the Seed Bank.
    -   `src/components/StatusPanel.tsx`: The main container in the header for status information, including the global search widget.
    -   `src/components/GlobalSearch.tsx`: The UI component for the global actor search and tracking widget located in the header.
    -   `src/components/Toast.tsx`: Renders a single toast notification.
    -   `src/components/ToastContainer.tsx`: Manages the on-screen layout and rendering of all active toasts.
    -   `src/services/flowerService.ts`: A TypeScript singleton wrapper for the WASM module.
    -   `src/stores/`: Contains all Zustand global state management stores.
    -   `src/utils.ts`: A module for shared utility functions.
    -   `src/constants.ts`: Global constants for the simulation.
    -   `src/types.ts`: Shared TypeScript types for the simulation.
