![EvoGardenLogo](public/EvoGarden-logo.png "EvoGarden logo")

## A Predator-Prey Simulation

[![CI](https://github.com/cristianglezm/EvoGarden/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/cristianglezm/EvoGarden/actions/workflows/ci.yml) [![CD](https://github.com/cristianglezm/EvoGarden/actions/workflows/cd.yml/badge.svg)](https://github.com/cristianglezm/EvoGarden/actions/workflows/cd.yml)

> [!NOTE]
> This project was created as an experiment with Google's Gemini 2.5 to explore what the LLM would build by giving it the documentation of [@cristianglezm/flower-evolver-wasm](https://github.com/cristianglezm/FlowerEvolver-WASM) (a npm package).
> 
> it made an emoji ecosystem where flowers evolve and survive, insects reproduce and pollinate the flowers, birds hunt insects not protected by the flowers.

A dynamic garden simulation where flowers evolve under the pressure of insects and birds. Watch a Darwinian battlefield unfold as flowers, insects, and birds interact in a delicate ecosystem, with visual traits driven by the NEAT algorithm.

## ✨ Features

-   **Dynamic Weather & Seasons**: Experience a living environment with four distinct seasons (Spring, Summer, Autumn, Winter) that cyclically affect temperature and humidity. Be prepared for unpredictable weather events like heatwaves, cold snaps, heavy rain, and droughts that create new evolutionary pressures.
-   **Direct Intervention Tools**: Take on the role of a gardener god. Manually trigger weather events like heatwaves or droughts, introduce new species into the ecosystem to see how they adapt, or plant champion flowers from your Seed Bank directly onto the grid.
-   **Intelligent Insects with Genetic AI**: Insects no longer move randomly. Each insect has a unique genetic code (genome) that determines its preferences for different flower traits. They actively seek out flowers that best match their genes, creating complex and emergent behaviors.
-   **Complex Social Insects & Warfare (Honeybees)**: Introducing Honeybees (`🐝`), Hives (`🛖`), and a dynamic territory system. Bees work together to gather pollen and produce honey. But they are also territorial; when bees from rival hives meet, they fight. They can leave `UNDER_ATTACK` signals on their territory marks, which propagate through the network to call for backup, creating emergent hive-vs-hive battles.
-   **Intelligent Ant Colonies & Warfare (`🐜`, `⛰️`)**: Ants establish colonies and work together as efficient scavengers, leaving decaying pheromone trails for other ants to follow to food. They are also territorial and will attack ants from rival colonies on sight, leaving warning signals on their trails to alert their nestmates to danger.
-   **Insect Evolution**: When insects reproduce, their offspring inherit a mix of their parents' genomes, with a chance for random mutation. This creates a dynamic evolutionary loop where insects adapt to the garden's flower population over generations.
-   **Stamina-Based Actions & Health**: Insects now manage health and stamina. Actions like moving and attacking cost stamina, and they must rest to recover. Their health slowly decays, and if it runs out, they die and decompose into a nutrient, completing the ecosystem's cycle of life.
-   **Corpse & Decay System**: When insects die of old age or from toxic flowers, they leave behind a corpse that slowly decays. Once fully decayed, the corpse transforms into a nutrient, completing another link in the ecosystem's cycle of life.
-   **Scavenger Pests (Cockroaches)**: When too many corpses pile up, cockroaches (`🪳`) emerge to clean the mess. They consume corpses and can even attack weak flowers, converting them into low-grade nutrients.
-   **Slow & Slimy Snails**: Introducing the Snail (`🐌`), a slow but sturdy herbivore that leaves behind a trail of slime, slowing down other insects that cross its path.
-   **High-Performance Canvas Rendering**: The entire simulation grid is rendered on a single `<canvas>` element, ensuring smooth performance even with hundreds of entities.
-   **User Goals & Scenarios (Challenges)**: Engage with a set of predefined challenges that track your progress across multiple playthroughs. Challenges cover survival (e.g., *Ancient Bloom*), predation (*Apex Predator*), ecosystem balance (*Circle of Life*), population milestones (*The Swarm*), genetic evolution (*Poison Garden*), the species you discover for the field guide (*Field Naturalist*, *Taxonomist*, *Keeper of the Garden*, *Strange Bloom*) and the species alive in the garden at once (*Mixed Meadow*, *Living Gallery*, *Botanical Paradise*).
-   **Seed Bank**: Automatically saves the genomes of "champion" flowers—the longest-lived, most toxic, and most healing—to a persistent database. These champions are then used to repopulate the garden after a collapse, ensuring genetic resilience. Users can view these champions, download their genomes, or clear the bank to start fresh.
-   **Field Guide & Species Collection**: Every mature flower is classified into one of **96 species** (a cell of the 12×8 self-organizing map embedded in the genetics module). The Field Guide is a map of those species: the ones you have found show their best specimen, the others show a silhouette of the species' prototype. Each species keeps its own record holders (longest lived, most toxic, most healing), the champions of the Seed Bank are marked on theirs, and any flower can be downloaded, viewed in 3D or planted from the guide. It opens from the Seed Bank, from a champion's card and from the details of any flower (*View in field guide*). See [Species, the Field Guide & Collecting Samples](#-species-the-field-guide--collecting-samples).
-   **Collect Samples**: The same collection doubles as a dataset: one button exports the flowers it holds as a `{"Generation": [...]}` file (and a manifest) that can train a better species map with the tools of [FlowerEvolver-WASM](https://github.com/cristianglezm/FlowerEvolver-WASM).
-   **Data Visualization & Analytics**: Monitor the health and evolution of your garden over time with dynamic, real-time charts. Track population dynamics (including specialized counts for **toxic** and **healing** flowers), key ecosystem events, the average expression of genetic traits, application performance, and a new Environment chart that visualizes the history of temperature and humidity changes.
-   **Advanced Notification System & Status Display**:
    -   **Centralized Header**: A retro, terminal-style header provides a non-intrusive feed of all simulation events, complemented by a real-time display of the current season, temperature, humidity, and any active weather events.
    -   **Detailed Event Review**: Click the header log to open a full-screen, scrollable panel with the complete event history.
    -   **Configurable Notifications**: Take control of the UI with three notification modes: log only, important toasts, or all toasts.
-   **Real-time Actor Tracking & Global Search**: Track any actor in real-time. Use the global search in the header to find an actor by its ID, highlight it on the grid, and then track it. The search is powered by a Trie data structure for instant, prefix-based matching. Alternatively, start tracking any actor with a single click from its details panel. The header control intelligently transforms to a "Stop Tracking" button for easy access.
-   **Real-time Performance Insights**: A status bar in the header shows what each genetics worker is doing and how many tasks are pending; click it for the details (flowers per second, milliseconds per flower, species backlog, how the workers were chosen) and copy them to compare setups.
-   **Polished & Refined UI**: The interface is designed for clarity and ease of use, featuring collapsible control panels, a clean status header, and subtle visual cues like inset shadows on scrollable content to improve usability.
-   **Dynamic Insect Lifecycle**: Insects reproduce by laying eggs, which have a gestation period to hatch. Some insects, like the butterfly, have a full metamorphosis cycle including a caterpillar and cocoon stage, creating a more complex and realistic population model.
-   **Layered Actor System**: Actors like insects and birds can occupy the same grid cell as flowers, allowing for more realistic interactions.
-   **Simulation State Persistence**: Save your garden's state to your browser's local storage and load it back in a future session.
-   **Collapsible UI**: The controls and data panels are slide-out sidebars, keeping the main view clean and focused on the simulation.
-   **Procedural 2D Flowers**: Each flower's appearance is determined by its unique genome, procedurally generated by [@cristianglezm/flower-evolver-wasm](https://github.com/cristianglezm/FlowerEvolver-WASM) and rendered in real-time.
-   **Configurable Flower Detail**: Adjust the radius of flowers (from 4 to 64) to balance visual complexity with performance.
-   **Genome & Environment-Driven Stats**: A flower's core statistics are all calculated from its genome in response to the current environmental conditions, meaning traits that improve survival can be naturally selected.
-   **Dynamic Ecosystem**: An interactive simulation of flowers, pollinating insects, and predatory birds whose actions directly impact the environment.
-   **Automated Ecosystem Balancing**: The simulation engine dynamically spawns predators (birds) or apex predators (eagles) in response to insect population booms and busts. An herbicide plane is also automatically deployed when flower density becomes too high.
-   **WASM-Powered Genetics**: A high-performance WebAssembly module handles complex genetic operations.
-   **Interactive Simulation**: Control world parameters like climate and population, pause/play the world, and reset with new initial conditions.
-   **Inspect Individuals**: Click on any cell to inspect its occupants. A selection panel appears if multiple actors are present. View detailed, real-time stats for any actor and start tracking them directly from their dedicated details panel.
-   **Interactive 3D Flower Viewer**: Generate and view a 3D model of any flower from its genome in an interactive modal viewer.
-   **Live AI Commentary (EcoObserver)**: Activate the AI-powered Garden Observer to receive commentary on your ecosystem. Powered by a visual large model(smolVLM, Qwen3-VL, etc), the AI analyzes the visual state of the grid and underlying population data to narrate key events, predation, and population booms. You can also chat directly with the Observer to ask specific questions about the current state of your garden.

## 🔬 Key Concepts

EvoGarden is more than just a visual simulation; it's a complex, self-regulating digital ecosystem. Understanding these core concepts will enhance your experience:

1.  **The Circle of Life**: The entire ecosystem is a closed loop. Birds eat insects, creating nutrient-rich droppings. Insects also die of old age, leaving corpses that decompose into nutrients. These nutrients are then absorbed by flowers, which heal and grow stronger. Healthy flowers can then support a larger insect population, which in turn supports the birds, completing the cycle.

2.  **Dual Genetic AI**: Evolution is at the heart of EvoGarden.
    *   **Flowers**: Their visual appearance, health, stamina, toxicity, and resilience to weather are all determined by a unique genetic code.
    *   **Insects**: They also possess a genome that dictates their preferences for certain flower traits. They actively seek out flowers that best match their genes, creating an evolutionary arms race between predator and prey.

3.  **Environmental Pressure**: The garden is a dynamic environment. The four seasons bring cyclical changes in temperature and humidity, while random weather events like heatwaves and cold snaps introduce sudden challenges. Flowers and insects that evolve to be resilient to these changes will have a significant survival advantage.

4.  **Ecosystem Balance**: The simulation actively works to prevent ecological collapse. If the insect population booms, the engine will spawn predatory birds. If the insect population crashes (leaving birds with no food), an apex predator (the eagle) may be introduced to cull the bird population. If flowers grow too dense, an herbicide plane is deployed. This creates a constantly shifting balance of power.

5.  **Diverse Permitted Actors**: The simulation allows for a diverse range of creatures, which can be enabled or disabled from the controls panel. The default ecosystem includes:
    *   **Birds**: Bird (`🐦`), Eagle (`🦅`).
    *   **Insects**: Butterfly (`🦋`), Caterpillar (`🐛`), Snail (`🐌`), Ladybug (`🐞`), Beetle (`🪲`), Scorpion (`🦂`), Honeybee (`🐝`), Ant (`🐜`), Spider (`🕷️`), Cockroach (`🪳`).

## 🔬 Simulation Deep Dive

### Performance & Architecture
-   **Multi-Worker Architecture**: The main simulation loop runs in one Web Worker; the expensive WASM genetics work (making flowers, classifying species) runs in others, so the simulation is never blocked. How many there are scales with your machine, see [Workers](#workers-how-many-and-what-they-do) below.
-   **Asynchronous Flower Creation**: New flowers are generated in the background without pausing the simulation. This is managed by an **`AsyncFlowerFactory`**, the scheduler that keeps the queue of requests and hands them to the workers. A lightweight `FlowerSeed` placeholder is used until the full flower is ready.
-   **Delta-Based State Updates**: The simulation worker sends only a small list of changes ("deltas") to the UI each tick, minimizing data transfer and ensuring a fluid experience.
-   **Layered Canvas & Change Detection**: The simulation is rendered across two stacked canvas layers (a static background for flowers/grid, a dynamic foreground for mobile actors) to eliminate the bottleneck of re-drawing hundreds of complex SVGs every frame.
-   **Multi-Quadtree Optimization**: The simulation uses multiple Quadtree data structures each tick for high-performance spatial querying, avoiding slow, full-grid scans.
-   **Trie-based Actor Search**: A Trie data structure is used for the global actor search, providing instant, prefix-based ID matching even with hundreds of actors on the grid.

### Workers: how many and what they do
-   **Three kinds of worker**: the **simulation worker** (the game loop and the scheduler), **flower workers** (each owns a WASM instance and makes flowers) and, when there are cores for it, a **species worker** (classifies flowers into species, keeps the collection, runs the classifier migration). The page talks to each through its own `MessageChannel`.
-   **The scheduler** (`AsyncFlowerFactory`, in the simulation worker) holds two queues: flowers waiting to be made and species jobs waiting to be classified. A flower worker holds two requests at a time and the least busy one gets the next; a cancel of a request that still waits costs nothing. Species jobs go in batches (32 to the species worker) because the cost of a call is mostly the classifier being parsed; a flower worker with nothing to make helps with a batch of 8. Flowers always go first.
-   **How many**: Controls → **Workers** takes *Automatic* or 1 to 8 and applies when the page is loaded again. Automatic is the logical processors minus four (the page, the simulation and the browser need threads too), at least two and at most eight; on three processors or fewer a single worker does everything. With two or more, one worker only classifies the species and the rest make flowers.
-   **Developer overrides**: `?speciesWorker=0|1` forces the species worker off or on and `?creationWorkers=N` (1–8) sets the number of flower workers; they win over the setting, so configurations can be compared on one machine.
-   **The worker bar**: the header shows a cell per worker with its requests in flight, the species worker's backlog and the total. Click it for the setup (known from the start) and, once the workers have reported, a table (flowers produced and per second, milliseconds per flower, seeds cancelled and thrown away, species by outcome, how many classifications the bounded queue let go and how the workers were chosen) and a **Copy** button that puts the same text on the clipboard.
-   **Building**: workers must be created with `new Worker(new URL('./x.worker.ts', import.meta.url), { type: 'module' })` written in full so Vite compiles them; `npm run build` runs `scripts/checkBuild.mjs`, which fails the build when a worker chunk is missing.

### Dynamic Environment
The garden is no longer static. It features a fully dynamic climate system that directly impacts the survival and evolution of its inhabitants.
-   **Seasons**: The simulation progresses through four distinct seasons (Spring, Summer, Autumn, Winter) on a configurable cycle. Each season has a different base temperature and humidity, creating long-term environmental pressures.
-   **Weather Events**: To add unpredictability, there is a small chance each tick for a random weather event to occur. These events, such as **heatwaves**, **cold snaps**, **heavy rain**, and **droughts**, temporarily override the seasonal norms and can drastically alter the ecosystem's balance.
-   **Spring Renewal**: To prevent total extinction and allow for recovery, the simulation has a built-in renewal mechanism. When winter ends and spring begins, if either the flower or insect populations have been wiped out, a small number of new, random actors are introduced to the garden.

### Actors & Behaviours
-   **Flowers**: The foundation of the ecosystem. Their appearance and base stats are dictated by their genome's response to the environment.
    -   **Environmental Stress**: Flowers are now directly affected by the climate. If the `currentTemperature` is outside their genetically-determined optimal range, their stamina is consumed **twice as fast**, rewarding flowers that evolve to be resilient to the local climate.
    -   **Toxicity & Healing**: Flowers have a genetically determined `toxicityRate`. If this rate is negative, the flower **heals** visiting insects, extending their lifespan. If it's above a certain positive threshold, it becomes **carnivorous**, damaging any insect that lands on it. This creates a powerful evolutionary trade-off between attracting pollinators and self-defense.
    -   **Lifecycle**: They consume stamina, then health. They heal by absorbing nutrients. If their health reaches zero, they wither.
    -   **Reproduction**: Mature flowers can reproduce in three ways: Proximity Pollination, Insect Pollination, and Wind Pollination.
-   **Insects** (General):
    -   **Genetic AI & Movement**: Insects use a Quadtree to find nearby flowers and then use their unique **genome** to calculate a "desirability score" for each one. This intelligent targeting leads them to flowers that best suit their evolved preferences, rather than just the closest one.
    -   **Lifecycle & Stamina**: All insects have `health` that slowly depletes, and a `stamina` bar that is consumed by actions like moving and attacking. They must rest to regenerate stamina. If an insect's health reaches zero, it dies and leaves behind a `Corpse` which will eventually decompose into a nutrient.
    -   **Dormancy**: Insects are sensitive to cold. If the `currentTemperature` drops below a certain threshold, they become dormant, ceasing all activity and halting their aging process until the weather warms up.
    -   **Interaction**: They are affected by a flower's toxicity. They will be damaged *by* carnivorous flowers or be healed by healing flowers. They carry pollen to other flowers to trigger reproduction.
    -   **Reproduction & Evolution**: Two insects of the same species on the same cell may lay an egg. The offspring inherits a combination of its parents' genomes, with a small chance for mutation, allowing the insect population to evolve over time.
-   **Specialized Insects**:
    -   **Butterflies & Caterpillars (`🦋`, `🐛`)**: This pair demonstrates a full metamorphosis lifecycle.
        -   **Butterfly**: A pure pollinator that causes no damage to flowers. When it reproduces, it lays an egg that hatches into a Caterpillar.
        -   **Caterpillar**: A voracious flower eater. After consuming a set amount of flower health, it transforms into a stationary `Cocoon` (`⚪️`).
        -   **Cocoon**: After a gestation period, the cocoon hatches into a new Butterfly, completing the cycle.
    -   **Ladybugs (`🐞`)**: A specialized predator that helps control the caterpillar population.
        -   **Hunter AI**: Ladybugs actively hunt for Caterpillars (`🐛`).
        -   **Pest Control**: When a Ladybug eats a Caterpillar, it removes the pest and gains a significant health and stamina boost.
        -   **Patrolling**: If no Caterpillars are present, Ladybugs will patrol between flowers, acting as secondary pollinators without damaging them.
    -   **Beetles (`🪲`)**: A "support" class insect that maintains the health of the garden.
        -   **Medic AI**: Beetles seek out healthy flowers to collect an abstract nutrient resource.
        -   **Healing**: After collecting, they search for weak or damaged flowers and deposit the resource, healing them.
    -   **Snails (`🐌`)**: A "tank" class insect.
        -   **Slow Movement**: Snails operate on a move cooldown, making them the slowest insects in the garden.
        -   **Slime Trails**: When a snail moves, it leaves behind a temporary `SlimeTrail` (`💧`). This trail slows down any other insect that moves onto its cell, creating a unique environmental hazard.
        -   **Sturdy**: They are sturdy herbivores that eat flowers like default insects but can take more damage.
    -   **Scorpions (`🦂`)**: A deadly ground predator that specializes in hunting other tough insects. Scorpions have a prey preference, prioritizing beetles (`🪲`), then snails (`🐌`), cockroaches (`🪳`), and finally ladybugs (`🐞`). When a scorpion kills its prey, it leaves behind a corpse and receives a significant health and stamina boost.
    -   **Spiders (`🕷️`) & Spider Webs (`🕸️`)**: A "trapper" class predator that creates a network of webs to catch prey.
        -   **Web Building**: Spiders use a special "web stamina" to build a limited number of webs in strategic, high-traffic locations.
        -   **Trapping**: Webs have a chance to trap any non-flying insect that moves onto their cell. Stronger insects have a higher chance to break free, damaging the web in the process.
        -   **Ambush & Consumption**: The spider waits on its web network. When an insect is trapped, the spider moves to the location, consumes the prey to restore its own health and stamina, and resets the trap.
    -   **Honeybees (`🐝`), Hives (`🛖`), & Territory (`📍`)**: A complex social insect system.
        -   **Honeybees**: Gather pollen from flowers and return it to their home `Hive`. Each bee is loyal to its hive.
        -   **Hives**: A central colony that converts collected pollen into honey. When honey reserves are high, the hive spawns new bees. Hives are distributed across the map based on a configurable grid area.
        -   **Territory Marks & Communication**: As bees travel, they leave invisible territory marks that serve as a sophisticated communication network.
        -   **Territorial Warfare**: The garden is a battlefield. When bees from rival hives cross paths, or when a bee moves onto and claims a territory mark left by a rival, it triggers a 'hunting' state. Bees will attack rivals on sight. Critically, they can leave an `UNDER_ATTACK` signal on their territory marks. This signal propagates through adjacent friendly marks like a wildfire, creating a scent-based alarm system that can rally nearby bees from the same hive to join the fight.
    -   **Ants (`🐜`), Ant Colonies (`⛰️`), & Pheromone Trails**: A complex system for ground-based scavenging and resource gathering.
        -   **Ants**: Foragers that operate on a state machine. They start by `seeking_food`. If they find a strong pheromone trail left by another ant, they will follow it. Otherwise, they search for food, prioritizing high-value items like corpses, eggs, and cocoons. Once an ant picks up food, it switches to a `returning_to_colony` state.
        -   **Ant Colonies**: Stationary bases that store food and spawn new ants. When an ant returns with food, the colony's `foodReserves` increase. When reserves are high, new ants are spawned.
        -   **Pheromone Trails**: Invisible trails left by ants that are returning to the colony *with food*. The `strength` of the trail is proportional to the value of the food being carried. These trails decay over time, and other ants will follow the strongest available trail, creating efficient, emergent paths to food sources.
        -   **Colony Conflict**: Ants are also fiercely territorial. When ants from different colonies meet, they will immediately fight. An ant engaging a rival can leave an `UNDER_ATTACK` signal on its pheromone trail. While this signal doesn't propagate like the bees' advanced system, it serves as a localized warning to other ants from the same colony that follow the trail, potentially drawing them into the conflict and creating skirmishes over resources.
-   **Cockroaches** (`🪳`): A pest and scavenger species. They are dynamically spawned by the `PopulationManager` when the number of corpses on the grid becomes too high. They hunt for corpses to eat, restoring their health and stamina. If no corpses are available, they will attack weak flowers.
-   **Eggs** (`🥚`): The offspring of insects. They remain stationary and hatch after a fixed timer, unless eaten by a bird.
-   **Birds** (`🐦`): The predators of the garden.
    -   **AI & Movement**: Birds use a Quadtree to efficiently scan for prey. They prioritize hunting unprotected insects, then defenseless cocoons, and finally stationary eggs. When not hunting, they exhibit a smarter patrolling AI, flying towards flowers to search for prey.
    -   **Prey Protection**: Birds cannot see or prey on an insect while it is resting on the same cell as a flower, making flowers a safe haven.
    -   **Nutrient Cycle**: After killing an insect, the bird leaves behind a nutrient-rich dropping. Eating a cocoon also produces a small nutrient.
-   **Eagles** (`🦅`): Apex predators introduced dynamically to maintain ecological balance by culling the bird population when insects become scarce.
-   **Herbicide Plane** (`✈️`) & **Smoke** (`💨`): A regulatory mechanism to prevent flower overgrowth. The plane flies in a straight line, leaving a trail of temporary, damaging smoke clouds that expand to create a wider path of effect.

### Nutrients & The Ecosystem Loop
Nutrients (`💩`) are the simulation's core resource, created from predated insects, insects that die of old age and leave a corpse that decays, or random bird droppings. They provide an area-of-effect heal to all flowers in a 3x3 area before being consumed. This creates a dynamic resource cycle: predators consume prey -> deaths create nutrients -> nutrients heal flowers -> healthy flowers support more prey -> more prey supports more predators.

### Ecosystem Balance & Dynamic Population Control
The garden is a self-regulating system. A dedicated **`PopulationManager`** actively monitors population trends to prevent ecological collapse.
-   **Insect Booms**: If the insect population grows too rapidly, the manager will dynamically spawn a new **bird**.
-   **Insect Crashes & Apex Predators**: If the insect population begins to crash, the manager intervenes by spawning an **eagle** to hunt a single bird.

### User Intervention Tools
The simulation is not just a passive experience. The **Intervention Tools** panel gives you direct control over the environment:
-   **Weather Control**: Instantly trigger any of the four major weather events (Heatwave, Coldsnap, Heavy Rain, Drought) to test the resilience of your ecosystem. A cooldown prevents overuse.
-   **Introduce Species**: Inject a specific number of any permitted actor—from snails to birds to entire ant colonies—into the garden at random locations.
-   **Plant a Champion**: Select a prized flower from your Seed Bank (or from a record in the Field Guide) and enter "Planting Mode." Click a cell on the grid to plant the seed, giving its superior genetics a fresh start. Only another plant is in the way: insects, trails and nutrients share the cell, and a flower seed that is still being made counts as a plant even though you cannot see it. If the cell is taken you are told and stay in planting mode.

## 🌼 Species, the Field Guide & Collecting Samples

-   **What a species is**: a cell of the 12×8 self-organizing map (SOM) embedded in `@cristianglezm/flower-evolver-wasm`. A flower is described by 267 numbers (a 16×16 silhouette of its petals and 11 statistics) and lands on the nearest cell. It is classified under the **default environment**, so a genome always has the same species whatever the weather. Names come from the shape of the cell's prototype (no colours).
-   **When**: a flower is asked for once, when it is mature, by the simulation worker; a worker classifies it and offers it to the collection. The collection is kept in IndexedDB (`speciesSamples`, `speciesGenomes`, `speciesMeta`) and is **not** part of a saved game; clearing the Seed Bank does not clear it.
-   **What is kept** (per species, the cap is set in Controls → *Species collection*: Small 25, Medium 50 (default) or Large 100): a flower replaces the most typical stored one only if it is less typical; the **first flower of a species** (the founder) and the **record holders** are never evicted; flowers far from every prototype are **atypical** and kept outside the cap (500 in all); flowers the classifier cannot place are kept as **unclassified** (200 in all). Genomes are identified by a hash of the genome, so the same flower is never stored twice.
-   **The Field Guide**: a map of the 96 species, polled every 3 seconds while open. Its header says how many species and samples there are and, while the workers are behind, how many flowers are waiting to be classified. Select a species for its details: samples kept, champions, and for each record the picture, the value, **Download** (the genome), **View 3D** and **Plant**. A species nobody has finished a life of says so.
-   **When the map changes**: every stored sample remembers the map it was classified with. When a new version of the genetics module ships another map, the species worker classifies the stored genomes again in the background (about a tenth of a second each), keeping the founders and records of each species and merging species that became one.
-   **Collect samples**: the button in the guide writes `evogarden-samples-<date>.json` (`{"Generation": [...]}`, unique flowers, species first, then atypical, then unclassified) and `evogarden-samples-<date>-manifest.json` (the map's fingerprint, the environment, versions, counts and one entry per flower). Train a better map with `tools/som.py` or `tools/train_som.ipynb` of [FlowerEvolver-WASM](https://github.com/cristianglezm/FlowerEvolver-WASM) and embed it there. The button is disabled while stale samples wait to be classified again.
-   **Challenges**: *Field Naturalist* (10 species), *Taxonomist* (24), *Keeper of the Garden* (48) and *Strange Bloom* (find an atypical flower) read the collection, so they count what you found in earlier sessions too. *Mixed Meadow*, *Living Gallery* and *Botanical Paradise* (10, 20 and 30 different species alive at once) count the living flowers that have been classified, so a flower is only counted once its species is known.

## 🧬 The Genetics Engine: `@cristianglezm/flower-evolver-wasm`

The visual variety and evolutionary mechanics are powered by a custom WebAssembly module. This service is responsible for creating and manipulating the genetic code of the flowers and rendering them as SVGs or 3D models.

**Important Note**: This service only handles the *genetic and visual* aspects of a flower. It does not track in-simulation state like `health`, `stamina`, or `age`. That state is managed entirely within the `SimulationEngine`.

### Core Functions:
-   `async makeFlower(): Flower`: Creates a new flower with a completely random genome.
-   `async reproduce(father: string, mother: string): Flower`: Combines the genomes of two parent flowers.
-   `async mutate(original: string, ...rates): Flower`: Applies random mutations to an existing genome.
-   `async getFlowerStats(genome: string, ...envFactors): FlowerGenomeStats`: **Core mechanic.** Takes a genome and environmental conditions (humidity, temperature) and returns the flower's base statistics.
-   `setParams(params: FEParams)`: Configures the rendering parameters.
-   `async draw3DFlower(genome: string): string`: Takes a flower's genome and returns a string containing a GLTF file for 3D rendering.

## 📁 Project Structure
-   `index.html`: The single-page entry point.
-   `package.json`: Defines project metadata, scripts (`dev`, `build`), and dependencies.
-   `vite.config.ts`, `tailwind.config.js`, `postcss.config.js`: Configuration files for the Vite build tool and the Tailwind CSS styling pipeline.
-   `src/`: Contains all the application source code.
    -   **`index.tsx` & `App.tsx`**: The main entry points for the React application.
    -   **`hooks/`**: Custom React hooks.
        -   `useSimulation.ts`: Creates the workers (from the plan of `workerPlan.ts`) and communicates with the simulation worker.
        -   `useActorTracker.ts`: Encapsulates actor tracking logic.
        -   `useSpeciesChallenges.ts`: Reads the species collection for the species challenges.
        -   `useFlower3DView.tsx`: The 3D view of a flower (pauses the garden while it is shown).
        -   `useDismissOnOutsideClick.ts`: Closes a panel on an outside click, but not on a click in a modal opened from it.
    -   **Workers** (in `src/`):
        -   `simulation.worker.ts`: Hosts the `SimulationEngine` and runs the main game loop.
        -   `flower.worker.ts`: Makes flowers with its own WASM instance; when it has nothing to make it classifies species too.
        -   `species.worker.ts`: Only classifies species, owns the collection's migration and the champions' records.
    -   **`lib/`**: The core simulation logic.
        -   `simulationEngine.ts`: The high-level orchestrator for the simulation's main loop.
        -   `populationManager.ts`: Manages ecosystem balancing and dynamic actor spawning.
        -   `asyncFlowerFactory.ts`: The scheduler: queues, workers, statistics.
        -   `ecosystemManager.ts`: Contains functions for system-wide behaviors.
        -   `behaviors/`: Contains individual behavior modules for each actor type.
        -   `workerPlan.ts`, `workerSetting.ts`, `workerReport.ts`, `workerWasm.ts`: How many workers, the player's choice, the text of the worker bar, starting a WASM instance.
        -   `species*.ts`: The species system: `species.ts` (names, genome ids), `speciesRepository.ts` (the policy of what is kept), `speciesJobs.ts` and `speciesRequester.ts` (what is classified, when), `speciesMigration.ts`, `speciesGuide.ts` and `speciesExport.ts` (the guide and the sample export).
    -   **`components/`**: All React components.
        -   **Main View**:
            -   `SimulationView.tsx`: Hosts the two stacked canvas elements.
        -   **UI Panels**:
            -   `Controls.tsx`: UI for changing simulation parameters.
            -   `ToolsPanel.tsx`: UI for direct user interventions (triggering weather, spawning actors).
            -   `DataPanel.tsx`: Main UI for challenges, analytics, and the Seed Bank.
            -   `FieldGuideHost.tsx` & `FieldGuideModal.tsx`: The Field Guide, rendered once in `App` so the Seed Bank, a champion card and a flower's details can all open it.
            -   `WorkerStatusDisplay.tsx`, `WorkersSetting.tsx`, `SpeciesCapSetting.tsx`: The worker bar and two settings of Controls.
            -   `...DetailsPanel.tsx`: A suite of panels for inspecting individual actors.
        -   **Header UI**:
            -   `StatusPanel.tsx`: The main container in the header for status information.
            -   `GlobalSearch.tsx`: The global actor search and tracking widget.
        -   **Data Visualization**:
            -   `ChartsPanel.tsx` & `charts/`: Components for rendering analytics charts.
            -   `SeedBankPanel.tsx`: Renders the champion flowers saved in the Seed Bank.
    -   **`services/`**: Singleton services.
        -   `flowerService.ts`: A TypeScript wrapper for the WASM module.
        -   `eventService.ts`: Central hub for all UI notifications.
        -   `db.ts`: Dexie (IndexedDB) setup for persistence (versions 4 and 5 add the species collection).
        -   `speciesClassifier.ts`, `speciesSource.ts`, `speciesStore.ts`, `speciesSettings.ts`: The species classifier over the WASM module, what the page reads of the collection, and how it is stored.
    -   **`stores/`**: Zustand global state management stores.
    -   **`types/` & `constants.ts`**: Shared TypeScript types and global simulation constants.

## 🚀 Getting Started

Follow these instructions to get a copy of the project up and running on your local machine for development.

### Prerequisites

You need to have [Node.js](https://nodejs.org/) (version 18 or higher) and npm installed on your computer.

### Installation & Setup

1.  Clone the repository and install the required dependencies using npm:
    ```bash
    npm install
    ```

### Running Locally

2.  To start the local development server, run the following command:
    ```bash
    npm run dev
    ```
    This will start a server, and you can view the application by navigating to the URL provided in your terminal (usually `http://localhost:5173`).

## 🧪 Testing

This project uses [Vitest](https://vitest.dev/) for unit and component testing and [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/) for rendering components in a test environment.

To run all tests once in the terminal, execute:
```bash
npm test
```

To run tests in interactive watch mode, which is useful during development:
```bash
npm run test:watch
```

For a more visual testing experience with a dedicated UI, run:
```bash
npm run test:ui
```

Tests that involve the genetics module use the **real** WASM library, and the species collection is tested against a real IndexedDB (`fake-indexeddb`); the workers are tested as real workers over `MessageChannel`s.

## 🧪 End-to-End Testing

This project uses [Playwright](https://playwright.dev/) for End-to-End (E2E) testing, which runs tests against a real browser to simulate user interactions.

To run all E2E tests, first make sure the development server is not running, and then execute:
```bash
npm run test:e2e
```

The specs are in `e2e/` (`app.spec.ts` for the game, `species.spec.ts` for the field guide, the species of a flower, the workers and the species challenges), with one controller per panel in `e2e/controllers/`. Note that `test:e2e` runs with `--update-snapshots`.

## 📦 Building for Production

To create a production-ready build of the application, run:
```bash
npm run build
```
This command will type-check the code and then bundle it into a `dist` directory.

## 🐛 Debugging with React DevTools

[React DevTools](https://github.com/facebook/react/tree/main/packages/react-devtools) is automatically configured to run alongside the development server for inspecting the React component hierarchy, state, and props. Simply start the development server to use it.

## 🚢 Deployment

This project includes a GitHub Actions workflow for continuous deployment to GitHub Pages. Any push to the `master` branch will automatically trigger a build and deployment.

## 📄 License

This project is licensed under the Apache License 2.0. See the [LICENSE.md](LICENSE.md) file for details.
