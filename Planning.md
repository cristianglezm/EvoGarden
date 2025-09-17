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

-   **`SimulationParams`**: A comprehensive interface for all simulation settings. This includes grid dimensions, initial actor counts, environmental factors (`humidity`, `temperature`, `wind`), and **core simulation constants** (`tickCostMultiplier`, `eggHatchTime`, etc.) to allow for easy tweaking and saving. It also includes the `notificationMode` to control the event system.
-   **Actor Types**: Define interfaces for each entity:
    -   `Flower`: Must include its current state (`health`, `stamina`, `age`), its genetic properties (`genome`, `imageData`, `maxHealth`, `maxStamina`, etc.), and its position.
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
-   **State & Analytics**:
    -   `TickSummary`: A detailed object compiled by the `SimulationEngine` each tick, containing aggregated data like population counts, average genetic traits, and key events (reproductions, predations, `eggsLaid`, `insectsBorn`).
    -   `Challenge`, `ChallengeState`: Interfaces for defining user challenges and managing their persistent state in a Zustand store.
    -   `AnalyticsDataPoint`, `AnalyticsState`: Interfaces for storing a history of `TickSummary` data for visualization, also managed in a persistent Zustand store.
-   **Events & Notifications**:
    -   `AppEvent`: A structured object for all events within the simulation, containing a `message`, `type`, and `importance`.
    -   `LogEntry`: The object stored in the `eventLogStore`, extending `AppEvent` with a unique ID.

## 4. Configuration Management

To promote flexibility and ensure saved states are perfectly reproducible, core simulation logic parameters should not be hardcoded as constants.

-   **Centralized in `SimulationParams`**: Constants like `FLOWER_TICK_COST_MULTIPLIER`, `EGG_HATCH_TIME`, `INSECT_REPRODUCTION_CHANCE`, etc., should be properties of the `SimulationParams` object.
-   **Default Configuration**: A `DEFAULT_SIM_PARAMS` object will be defined in `src/constants.ts` to provide the initial state.
-   **Benefits**: This approach allows for easy tweaking from the UI (e.g., creating "easy" or "hard" modes) and ensures that when a state is saved and loaded, it runs with the exact same rules, preventing inconsistencies.

## 5. Core Architecture

The application's architecture is designed to separate the computationally intensive simulation from the UI, ensuring the user experience remains fluid and responsive.

### 5.1. Web Worker for Performance (`src/simulation.worker.ts`)
-   **Role**: The worker acts as a simple, robust **host** for the `SimulationEngine`. Its primary responsibility is to run on a separate thread, isolating all heavy computation from the UI.
-   **Message Broker**: It functions as a message broker, receiving commands from the UI (via the `useSimulation` hook) and forwarding them to the `SimulationEngine` instance. It then relays results from the engine (an array of state changes called deltas, a batch of events, and a tick summary) back to the UI thread. This keeps the worker's own logic minimal.

### 5.2. The Simulation Engine & Behavior System (`src/lib/`)
-   **`SimulationEngine` (`simulationEngine.ts`)**: This class is the **orchestrator** of the simulation. Its main game loop (`calculateNextTick`) manages the simulation's state and sequence of events. Instead of returning the entire grid state, it now calculates a minimal set of "delta" updates (e.g., actor added, removed, or properties changed) which are sent to the UI for efficient state synchronization. It does not contain actor-specific logic itself; instead, it delegates that to the Behavior System. Its responsibilities include:
    -   Maintaining the master actor state (`grid`, `tick` count).
    -   Creating and populating the Quadtrees each tick.
    -   Iterating through actors and calling the appropriate behavior module.
    -   Handling global events like insect reproduction and nutrient healing.
    -   Collecting all `AppEvent` objects generated by behaviors during a tick.
    -   Compiling the `TickSummary` at the end of each tick.

-   **Behavior System (`lib/behaviors/`)**: This is a modular pattern for separating actor logic. The engine calls a dedicated function for each actor type, passing the actor's state and a `context` object with necessary global information. Crucially, behaviors no longer create UI notifications directly; they now push structured `AppEvent` objects into the context's `events` array.

    -   **`flowerBehavior`**: Manages the complete flower lifecycle.
        -   **State**: Handles aging, maturation, and energy consumption (stamina, then health).
        -   **Reproduction**: Implements all three reproduction methods:
            1.  **Asexual Expansion**: A chance to spawn a clone in an adjacent empty cell.
            2.  **Proximity Pollination**: Sexual reproduction with an adjacent, mature flower.
            3.  **Wind Pollination**: A chance to pollinate a distant flower along the wind's path.

    -   **`insectBehavior`**: Governs insect AI and its interaction with flowers.
        -   **Lifecycle**: Insects have a limited `lifespan`. Each tick, it decrements. If it reaches zero, the insect dies and is replaced by a nutrient, completing the cycle and dispatching a "died of old age" event.
        -   **AI**: Uses the `flowerQtree` to find the nearest flower within its vision range and moves towards it. To prevent unnatural swarming behavior (or "zerging"), a degree of randomness is introduced. Even when a target is identified, there is a chance the insect will make a random move instead. If no flower is found, it wanders randomly.
        -   **Interaction**: When it lands on a flower's cell, it inflicts a small amount of damage and picks up the flower's pollen (genome).
        -   **Pollination**: If it is carrying pollen and lands on a *different*, mature flower, it triggers a sexual reproduction event by calling `createNewFlower`.

    -   **`birdBehavior`**: Governs predator AI and connects the food chain.
        -   **AI**: Uses the main `qtree` to find prey. It has a target priority: it will always prefer to hunt unprotected insects, but if none are available, it will target stationary eggs. When not actively hunting, it implements a **patrolling AI**, selecting a random flower as a temporary destination to search for prey near food sources. Its vision check remains active during patrols, allowing it to divert and hunt if a target of opportunity appears.
        -   **Hunting**: Moves directly towards its target. Upon reaching the target, it "eats" it (removes the insect/egg from the simulation) and dispatches a corresponding "eaten" event.
        -   **Nutrient Cycle**: After preying on an insect, it creates a nutrient-rich dropping (`💩`) on that cell. Eating an egg does not produce a nutrient.
    
    -   **`eagleBehavior`**: The apex predator, spawned as a regulatory mechanism.
        -   **AI**: Uses the main `qtree` to find the nearest bird.
        -   **Hunting**: Moves directly towards its target. Upon reaching the target, it "eats" it and is immediately removed from the simulation, dispatching a high-importance "hunted a bird" event.
        -   **Lifecycle**: Eagles are transient actors. If they cannot find a target, they despawn. Their purpose is to perform a single hunt to cull the bird population.

    -   **`herbicidePlaneBehavior`**: The plane follows a simple, deterministic path.
        -   **Movement**: Spawns at a random edge of the grid and moves in a straight line towards the opposite edge, one cell per tick.
        -   **Action**: At each cell on its path, it drops a single `HerbicideSmoke` actor.
        -   **Lifecycle**: Once it moves past its destination coordinate, it is removed from the simulation.

    -   **`herbicideSmokeBehavior`**: A temporary, damaging area-of-effect entity.
        -   **Damage**: Each tick, it applies a fixed amount of damage to any flowers in its current cell.
        -   **Expansion**: On its first tick of existence, it expands by creating new smoke actors in all 8 adjacent cells (if they don't already contain smoke). This happens only if `canBeExpanded` is higher than zero.
        -   **Lifecycle**: It has a short `lifespan`. Each tick, the timer decrements. It is removed when the timer expires.

    -   **`eggBehavior` & `nutrientBehavior`**: Simple state-machine behaviors.
        -   `eggBehavior`: Decrements a `hatchTimer`. When the timer reaches zero, it is removed. A new insect is spawned in its place (dispatching a "hatched" event), unless a predator (like a bird) is occupying the same cell, in which case the egg is considered "eaten" and no insect spawns.
        -   `nutrientBehavior`: Decrements a `lifespan` timer. It is removed when the timer expires. Its healing effect is handled globally by the `SimulationEngine` before its own tick is processed.

-   **Dynamic Population Control**: To create a more resilient and self-regulating ecosystem, the `SimulationEngine` actively monitors population trends.
    -   **Trend Analysis**: It maintains a history of insect population counts over a recent window of ticks (`POPULATION_TREND_WINDOW`).
    -   **Predator Spawning**: If the insect population's growth rate exceeds a `POPULATION_GROWTH_THRESHOLD_INSECT`, a new **bird** is spawned at a random available location to act as a natural check.
    -   **Apex Predator Intervention**: Conversely, if the insect population is declining too rapidly (exceeding `POPULATION_DECLINE_THRESHOLD_INSECT`), it suggests the bird population may be too high. To correct this, an **eagle** is spawned. The eagle hunts a single bird and then leaves the simulation, culling the predator population to allow insects to recover.
    -   **Cooldowns**: To prevent chaotic fluctuations, both bird and eagle spawning events are subject to cooldowns (`BIRD_SPAWN_COOLDOWN`, `EAGLE_SPAWN_COOLDOWN`), ensuring these population controls act as gradual adjustments rather than sudden shocks.

-   **Herbicide Control**: To prevent the entire grid from being filled with flowers (a "flower deadlock" scenario that stops birds from hunting), the engine deploys an automated control mechanism.
    -   **Trigger**: The engine monitors the total number of flowers. If the count exceeds a configurable percentage of the total grid cells (`herbicideFlowerDensityThreshold`), it triggers the event.
    -   **Action**: An `HerbicidePlane` actor is spawned at a random point on the grid's perimeter.
    -   **Cooldown**: To prevent constant spawning, this event is subject to a `herbicideCooldown`.

### 5.3. Performance Optimization with Quadtrees (`lib/Quadtree.ts`)
To avoid performance degradation as the number of actors grows, the `SimulationEngine` creates and populates several purpose-built Quadtrees **on every tick**. This provides highly efficient spatial lookups for different AI needs.

-   **General `qtree`**: Contains all actors. Used for broad queries, such as:
    -   Bird vision (finding any nearby, unprotected insects and eggs).
    -   Eagle vision (finding the nearest bird).
    -   Nutrient area-of-effect healing.

-   **`flowerQtree`**: Contains only flowers. This is a critical optimization used exclusively by:
    -   `insectBehavior` to allow insects to find the nearest flower target without having to scan through birds, eggs, or other insects.
    -   `birdBehavior` to allow birds to find patrol targets when idle.

-   **`insectQtree`**: Contains only insects. This tree is built and used within the `SimulationEngine`'s main loop to handle:
    -   **Insect Reproduction**: Allows an insect to efficiently find if another insect of the same species is on the same cell to initiate a reproduction event. This avoids a costly `O(n^2)` check between all insects.

### 5.4. UI/Worker Communication (`src/hooks/useSimulation.ts`)
-   **`useSimulation` Hook**: This custom hook is the sole bridge between the React UI and the simulation worker.
    -   **Responsibilities**: Manages the worker's lifecycle, sends commands (start, pause, reset), and listens for incoming messages.
    -   **State Synchronization**: When it receives a 'tick-update' message, it efficiently processes an array of deltas. It maintains a local Map of actors and applies these changes (add, update, remove) to reconstruct the new grid state. This avoids the expensive process of deserializing the entire grid on every tick. It then forwards the tick summary to the analytics and challenge stores and sends all new events to the EventService.

### 5.5. Centralized Event & Notification System
To decouple the simulation from the UI and improve performance, a centralized event service manages all notifications.
-   **`eventService.ts`**: A singleton service on the main thread that acts as a central hub. Its `dispatch(event)` method is the single entry point for all notifications.
-   **Decoupling**: The simulation engine and its behaviors no longer know about toasts or any specific UI implementation. They simply generate and return an array of `AppEvent` objects each tick.
-   **Routing Logic**: The `EventService` contains all the logic for how to handle an event. Based on the user's `notificationMode` setting and the event's `importance`, it decides whether to send the event to the `eventLogStore`, the `toastStore`, or both. This centralizes all notification rules in one place.
-   **Performance**: For high-frequency, low-importance events, this system routes them to the highly performant Event Log instead of creating dozens of expensive toast components, solving the "toast storm" performance issue.

## 6. Component Architecture (`src/components/`)
-   **`App.tsx`**: Root component. Manages UI state (sidebar visibility), orchestrates the `useSimulation` hook, and handles the save/load logic on the main thread.
-   **`SimulationView.tsx`**: The host component for the rendering engine. It creates and manages two stacked `<canvas>` elements (one for static background, one for dynamic foreground) and passes them to the `RenderingEngine`. It also captures user click events on the top canvas and forwards them to the application state.
-   **`Controls.tsx`**: The UI for all `SimulationParams`, allowing users to configure and reset the simulation.
-   **`FlowerDetailsPanel.tsx`**: Displays detailed data for a selected flower, including stats, genome, and a button to launch the 3D viewer. Includes a toggle for emissive materials.
-   **`Flower3DViewer.tsx`**: Renders a flower's 3D model using `@react-three/fiber` inside a modal.
-   **`DataPanel.tsx`**: A slide-out panel with a tabbed interface for switching between `ChallengesPanel` and `ChartsPanel`.
-   **`ChallengesPanel.tsx`**: Subscribes to `challengeStore` and displays challenge progress.
-   **`ChartsPanel.tsx`**: Subscribes to `analyticsStore` and renders visualizations of the simulation's history.
-   **Notification Components**:
    -   `EventLog.tsx`: A non-intrusive, terminal-style log in the header that displays a real-time feed of events from the `eventLogStore`. It is clickable to open the full panel.
    -   `FullEventLogPanel.tsx`: A large, slide-out side panel that displays the full, scrollable history of events, pausing the simulation for review.
    -   `Toast.tsx` & `ToastContainer.tsx`: Render pop-up notifications based on state from the `toastStore`.
-   **Global State (Zustand Stores)**:
    -   `eventLogStore`: Manages the state for the `EventLog`, holding a capped-size array of recent events.
    -   `toastStore`: Manages UI notifications for high-importance events.
    -   `challengeStore` & `analyticsStore`: Use `persist` middleware to save progress and historical data to `localStorage`.

## 7. Error Handling and Resilience
-   **WASM Initialization Failure**: Both the main thread's `flowerService` and the worker's instance must handle potential failures during the `initialize()` call. If it fails, the application should display a clear, user-friendly error message and not attempt to start the simulation. A timeout should be used to prevent the app from hanging indefinitely.
-   **Worker Errors**: The `useSimulation` hook should attach an `onerror` handler to the worker instance. If the worker terminates unexpectedly, the UI should be notified, the simulation should be shown as paused, and an error message should be displayed.

## 8. Accessibility (A11y)
-   **Canvas Accessibility**: The primary simulation view on the canvas is not inherently accessible. To mitigate this:
    -   Key events (e.g., a flower being pollinated, an insect being eaten) are made available in the text-based `FullEventLogPanel`, which is keyboard-accessible.
    -   The `ToastContainer` is an `aria-live` region so screen readers can announce important pop-up notifications.
-   **UI Controls**: All interactive UI elements (buttons, sliders, tabs, modals) must be fully keyboard-navigable and have appropriate ARIA attributes (`aria-label`, `aria-valuenow`, `aria-selected`, `role`, etc.).

## 9. Testing & Developer Experience
-   **Unit & Component Testing**: Use Vitest and React Testing Library. Isolate logic in hooks and behavior modules for easier testing. Mock dependencies like the `flowerService` and the Web Worker itself in tests.
-   **E2E Testing**: Use Playwright to test full user flows, including starting/pausing the simulation, changing parameters, and interacting with panels.
-   **Automatic React DevTools**: A custom Vite plugin will be used to automatically launch the standalone React DevTools application and inject its connection script, providing a zero-config debugging experience for developers.
