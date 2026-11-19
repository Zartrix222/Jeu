using System;
using Industria.Simulation.Recipes;

namespace Industria.Simulation.Factory
{
    /// <summary>
    /// Generic recipe machine (smelter, constructor, assembler...). Ingredients are consumed when a cycle starts,
    /// products are delivered when the cycle ends (and wait if the output buffer is full).
    /// </summary>
    public sealed class ProcessorMachine : Machine
    {
        private readonly RecipeRegistry _recipes;
        private double _elapsed;
        private bool _running;

        public string MachineType { get; }
        public RecipeDefinition Recipe { get; private set; }
        public float SpeedMultiplier { get; set; } = 1f;

        public override float Progress01 => Recipe == null || !_running ? 0f : (float)Math.Min(1.0, _elapsed / Recipe.duration);
        public bool IsRunning => _running;

        public ProcessorMachine(string buildableId, string machineType, RecipeRegistry recipes, int bufferCapacity, int outputPorts = 1)
            : base(buildableId, outputPorts, bufferCapacity)
        {
            MachineType = machineType;
            _recipes = recipes ?? throw new ArgumentNullException(nameof(recipes));
            Status = MachineStatus.NoRecipe;
        }

        /// <summary>True when the recipe can be changed without losing items.</summary>
        public bool IsEmpty
        {
            get
            {
                if (_running) return false;
                foreach (var s in inputSlots) if (s.Count > 0) return false;
                foreach (var s in outputSlots) if (s.Count > 0) return false;
                return true;
            }
        }

        /// <summary>Selects a recipe. Only allowed when the machine is empty (no item is ever destroyed).</summary>
        public bool SetRecipe(RecipeDefinition recipe)
        {
            if (recipe == Recipe) return true;
            if (recipe != null && recipe.machineType != MachineType) return false;
            if (!IsEmpty) return false;
            Recipe = recipe;
            _elapsed = 0f;
            _running = false;
            inputSlots.Clear();
            outputSlots.Clear();
            if (recipe != null)
            {
                foreach (var s in recipe.inputs)
                    if (FindSlot(inputSlots, s.itemId) == null) inputSlots.Add(new MachineSlot(s.itemId, Math.Max(BufferCapacity, s.count * 2)));
                foreach (var s in recipe.outputs)
                    if (FindSlot(outputSlots, s.itemId) == null) outputSlots.Add(new MachineSlot(s.itemId, Math.Max(BufferCapacity, s.count * 2)));
            }
            Status = recipe == null ? MachineStatus.NoRecipe : MachineStatus.NoInput;
            return true;
        }

        public override bool CanInsert(string itemId)
        {
            if (Recipe == null)
            {
                // Auto-select the first recipe consuming this item.
                return _recipes.FindByInput(MachineType, itemId) != null;
            }
            return base.CanInsert(itemId);
        }

        public override bool TryInsert(string itemId)
        {
            if (Recipe == null)
            {
                var auto = _recipes.FindByInput(MachineType, itemId);
                if (auto == null || !SetRecipe(auto)) return false;
            }
            return base.TryInsert(itemId);
        }

        public override void Tick(float dt)
        {
            if (Recipe == null)
            {
                Status = MachineStatus.NoRecipe;
                return;
            }

            if (!_running)
            {
                if (HasIngredients() && HasOutputRoom())
                {
                    foreach (var s in Recipe.inputs) FindSlot(inputSlots, s.itemId).Count -= s.count;
                    _running = true;
                    _elapsed = 0f;
                }
                else
                {
                    Status = HasIngredients() ? MachineStatus.OutputFull : MachineStatus.NoInput;
                }
            }

            if (_running)
            {
                _elapsed += (double)dt * SpeedMultiplier + 1e-9;
                Status = MachineStatus.Working;
                if (_elapsed >= Recipe.duration)
                {
                    if (HasOutputRoom())
                    {
                        foreach (var s in Recipe.outputs) FindSlot(outputSlots, s.itemId).Count += s.count;
                        _running = false;
                        // Keep the overflow so long frames do not lose production time.
                        _elapsed -= Recipe.duration;
                        if (HasIngredients() && HasOutputRoom())
                        {
                            foreach (var s in Recipe.inputs) FindSlot(inputSlots, s.itemId).Count -= s.count;
                            _running = true;
                        }
                        else
                        {
                            _elapsed = 0f;
                        }
                    }
                    else
                    {
                        _elapsed = Recipe.duration;
                        Status = MachineStatus.OutputFull;
                    }
                }
            }

            PushOutputs();
        }

        private bool HasIngredients()
        {
            foreach (var s in Recipe.inputs)
            {
                var slot = FindSlot(inputSlots, s.itemId);
                if (slot == null || slot.Count < s.count) return false;
            }
            return true;
        }

        private bool HasOutputRoom()
        {
            foreach (var s in Recipe.outputs)
            {
                var slot = FindSlot(outputSlots, s.itemId);
                if (slot == null || slot.Space < s.count) return false;
            }
            return true;
        }

        public override MachineState CaptureState()
        {
            var state = base.CaptureState();
            state.recipeId = Recipe?.id;
            state.progress = (float)_elapsed;
            state.running = _running;
            return state;
        }

        public override void RestoreState(MachineState state)
        {
            if (state == null) return;
            if (!string.IsNullOrEmpty(state.recipeId) && _recipes.TryGet(state.recipeId, out var recipe))
            {
                // Force recipe even if not empty (fresh machine).
                SetRecipe(recipe);
            }
            base.RestoreState(state);
            _running = Recipe != null && state.running;
            _elapsed = _running ? Math.Max(0f, state.progress) : 0f;
        }
    }
}
