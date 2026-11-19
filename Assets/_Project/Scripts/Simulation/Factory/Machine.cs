using System;
using System.Collections.Generic;
using Industria.Simulation.Items;

namespace Industria.Simulation.Factory
{
    /// <summary>
    /// Common machine logic: input / output buffers, output ports pushing items to connected acceptors,
    /// and helpers used by the player to insert or collect items.
    /// </summary>
    public abstract class Machine : FactoryEntity, IItemAcceptor
    {
        protected readonly List<MachineSlot> inputSlots = new List<MachineSlot>();
        protected readonly List<MachineSlot> outputSlots = new List<MachineSlot>();
        private IItemAcceptor[] _outputTargets;
        private int _nextOutputSlot;

        public int BufferCapacity { get; }
        public MachineStatus Status { get; protected set; } = MachineStatus.Idle;
        /// <summary>0..1 progress of the current cycle (for UI / visuals).</summary>
        public abstract float Progress01 { get; }

        public IReadOnlyList<MachineSlot> InputSlots => inputSlots;
        public IReadOnlyList<MachineSlot> OutputSlots => outputSlots;
        public int OutputPortCount => _outputTargets.Length;

        protected Machine(string buildableId, int outputPortCount, int bufferCapacity) : base(buildableId)
        {
            _outputTargets = new IItemAcceptor[Math.Max(0, outputPortCount)];
            BufferCapacity = Math.Max(1, bufferCapacity);
        }

        public IItemAcceptor GetOutputTarget(int port) => port >= 0 && port < _outputTargets.Length ? _outputTargets[port] : null;

        public void SetOutputTarget(int port, IItemAcceptor target)
        {
            if (port < 0 || port >= _outputTargets.Length) throw new ArgumentOutOfRangeException(nameof(port));
            _outputTargets[port] = target;
        }

        public override void ClearReferencesTo(FactoryEntity removed)
        {
            for (int i = 0; i < _outputTargets.Length; i++)
                if (ReferenceEquals(_outputTargets[i], removed)) _outputTargets[i] = null;
        }

        // ---------------- IItemAcceptor ----------------
        public virtual bool CanInsert(string itemId)
        {
            var slot = FindSlot(inputSlots, itemId);
            return slot != null && !slot.IsFull;
        }

        public virtual bool TryInsert(string itemId)
        {
            if (!CanInsert(itemId)) return false;
            FindSlot(inputSlots, itemId).Count++;
            return true;
        }

        // ---------------- Output pushing ----------------
        /// <summary>Pushes at most one item per connected output port per tick.</summary>
        protected void PushOutputs()
        {
            if (outputSlots.Count == 0) return;
            for (int p = 0; p < _outputTargets.Length; p++)
            {
                var target = _outputTargets[p];
                if (target == null) continue;
                // Round robin through output slots so multi-output recipes share the port.
                for (int attempt = 0; attempt < outputSlots.Count; attempt++)
                {
                    var slot = outputSlots[(_nextOutputSlot + attempt) % outputSlots.Count];
                    if (slot.Count <= 0) continue;
                    if (target.TryInsert(slot.ItemId))
                    {
                        slot.Count--;
                        _nextOutputSlot = (_nextOutputSlot + attempt + 1) % outputSlots.Count;
                        break;
                    }
                }
            }
        }

        // ---------------- Player helpers ----------------
        /// <summary>Moves as many accepted items as possible from the inventory into the input buffers.</summary>
        public int InsertFromInventory(Inventory inventory)
        {
            int moved = 0;
            if (inventory == null) return 0;
            foreach (var stack in inventory.ToList())
            {
                while (inventory.Count(stack.itemId) > 0 && TryInsert(stack.itemId))
                {
                    inventory.Remove(stack.itemId, 1);
                    moved++;
                }
            }
            return moved;
        }

        /// <summary>Moves the output buffers into the inventory. Returns moved amount.</summary>
        public int CollectOutputs(Inventory inventory) => MoveSlotsTo(outputSlots, inventory);

        /// <summary>Moves every buffer (inputs and outputs) into the inventory.</summary>
        public int CollectAll(Inventory inventory) => MoveSlotsTo(outputSlots, inventory) + MoveSlotsTo(inputSlots, inventory);

        private static int MoveSlotsTo(List<MachineSlot> slots, Inventory inventory)
        {
            if (inventory == null) return 0;
            int moved = 0;
            foreach (var slot in slots)
            {
                if (slot.Count <= 0) continue;
                int leftover = inventory.Add(slot.ItemId, slot.Count);
                moved += slot.Count - leftover;
                slot.Count = leftover;
            }
            return moved;
        }

        protected static MachineSlot FindSlot(List<MachineSlot> slots, string itemId)
        {
            for (int i = 0; i < slots.Count; i++)
                if (slots[i].ItemId == itemId) return slots[i];
            return null;
        }

        // ---------------- Persistence ----------------
        public virtual MachineState CaptureState()
        {
            var state = new MachineState();
            foreach (var s in inputSlots) if (s.Count > 0) state.inputs.Add(new ItemStack(s.ItemId, s.Count));
            foreach (var s in outputSlots) if (s.Count > 0) state.outputs.Add(new ItemStack(s.ItemId, s.Count));
            return state;
        }

        public virtual void RestoreState(MachineState state)
        {
            if (state == null) return;
            foreach (var s in state.inputs) { var slot = FindSlot(inputSlots, s.itemId); if (slot != null) slot.Count = Math.Min(slot.Capacity, s.count); }
            foreach (var s in state.outputs) { var slot = FindSlot(outputSlots, s.itemId); if (slot != null) slot.Count = Math.Min(slot.Capacity, s.count); }
        }
    }

    /// <summary>Serializable runtime state of a machine.</summary>
    [Serializable]
    public sealed class MachineState
    {
        public string recipeId;
        public float progress;
        public bool running;
        public List<ItemStack> inputs = new List<ItemStack>();
        public List<ItemStack> outputs = new List<ItemStack>();
    }
}
