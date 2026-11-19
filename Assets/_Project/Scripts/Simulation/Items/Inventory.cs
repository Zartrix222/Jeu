using System;
using System.Collections.Generic;

namespace Industria.Simulation.Items
{
    /// <summary>
    /// Slot based inventory. Each slot holds one item type up to that item's max stack.
    /// All mutating methods raise <see cref="Changed"/> once when something actually changed.
    /// </summary>
    public sealed class Inventory
    {
        private readonly ItemStack[] _slots;
        private readonly ItemRegistry _registry;

        public event Action Changed;

        public Inventory(int slotCount, ItemRegistry registry)
        {
            if (slotCount <= 0) throw new ArgumentOutOfRangeException(nameof(slotCount));
            _slots = new ItemStack[slotCount];
            _registry = registry ?? throw new ArgumentNullException(nameof(registry));
        }

        public int SlotCount => _slots.Length;

        public ItemStack GetSlot(int index) => _slots[index];

        /// <summary>Total amount of an item across all slots.</summary>
        public int Count(string itemId)
        {
            int total = 0;
            for (int i = 0; i < _slots.Length; i++)
                if (_slots[i].count > 0 && _slots[i].itemId == itemId) total += _slots[i].count;
            return total;
        }

        public bool Has(string itemId, int amount) => Count(itemId) >= amount;

        public bool HasAll(IReadOnlyList<ItemStack> stacks)
        {
            if (stacks == null) return true;
            // Aggregate in case the same item appears twice in a cost list.
            var needed = Aggregate(stacks);
            foreach (var pair in needed)
                if (Count(pair.Key) < pair.Value) return false;
            return true;
        }

        /// <summary>How many of this item could still be added.</summary>
        public int SpaceFor(string itemId)
        {
            int max = _registry.MaxStackOf(itemId);
            int space = 0;
            for (int i = 0; i < _slots.Length; i++)
            {
                if (_slots[i].count <= 0) space += max;
                else if (_slots[i].itemId == itemId) space += Math.Max(0, max - _slots[i].count);
            }
            return space;
        }

        public bool CanAdd(string itemId, int amount) => SpaceFor(itemId) >= amount;

        /// <summary>Adds as much as possible and returns the amount that did NOT fit.</summary>
        public int Add(string itemId, int amount)
        {
            if (amount <= 0 || string.IsNullOrEmpty(itemId)) return Math.Max(0, amount);
            if (!_registry.Contains(itemId)) throw new ArgumentException($"Unknown item '{itemId}'.");
            int max = _registry.MaxStackOf(itemId);
            int remaining = amount;

            // 1) top up existing stacks
            for (int i = 0; i < _slots.Length && remaining > 0; i++)
            {
                if (_slots[i].count <= 0 || _slots[i].itemId != itemId) continue;
                int add = Math.Min(remaining, max - _slots[i].count);
                if (add <= 0) continue;
                _slots[i].count += add;
                remaining -= add;
            }
            // 2) fill empty slots
            for (int i = 0; i < _slots.Length && remaining > 0; i++)
            {
                if (_slots[i].count > 0) continue;
                int add = Math.Min(remaining, max);
                _slots[i] = new ItemStack(itemId, add);
                remaining -= add;
            }

            if (remaining != amount) Changed?.Invoke();
            return remaining;
        }

        /// <summary>Removes up to <paramref name="amount"/> and returns how many were removed.</summary>
        public int Remove(string itemId, int amount)
        {
            if (amount <= 0) return 0;
            int remaining = amount;
            // Remove from the last slots first so the first slots stay stable for the player.
            for (int i = _slots.Length - 1; i >= 0 && remaining > 0; i--)
            {
                if (_slots[i].count <= 0 || _slots[i].itemId != itemId) continue;
                int take = Math.Min(remaining, _slots[i].count);
                _slots[i].count -= take;
                remaining -= take;
                if (_slots[i].count <= 0) _slots[i] = default;
            }
            int removed = amount - remaining;
            if (removed > 0) Changed?.Invoke();
            return removed;
        }

        /// <summary>Removes every stack of the list atomically. Returns false (and changes nothing) if anything is missing.</summary>
        public bool TryRemoveAll(IReadOnlyList<ItemStack> stacks)
        {
            if (!HasAll(stacks)) return false;
            if (stacks == null) return true;
            foreach (var s in stacks) Remove(s.itemId, s.count);
            return true;
        }

        public void Clear()
        {
            for (int i = 0; i < _slots.Length; i++) _slots[i] = default;
            Changed?.Invoke();
        }

        /// <summary>Snapshot of non-empty slots (for saving / UI).</summary>
        public List<ItemStack> ToList()
        {
            var list = new List<ItemStack>();
            for (int i = 0; i < _slots.Length; i++)
                if (_slots[i].count > 0) list.Add(_slots[i]);
            return list;
        }

        /// <summary>Replaces content with the given stacks (unknown items are skipped).</summary>
        public void Load(IEnumerable<ItemStack> stacks)
        {
            for (int i = 0; i < _slots.Length; i++) _slots[i] = default;
            if (stacks != null)
            {
                foreach (var s in stacks)
                {
                    if (s.IsEmpty || !_registry.Contains(s.itemId)) continue;
                    AddSilently(s.itemId, s.count);
                }
            }
            Changed?.Invoke();
        }

        private void AddSilently(string itemId, int amount)
        {
            var handler = Changed;
            Changed = null;
            try { Add(itemId, amount); }
            finally { Changed = handler; }
        }

        internal static Dictionary<string, int> Aggregate(IReadOnlyList<ItemStack> stacks)
        {
            var result = new Dictionary<string, int>(StringComparer.Ordinal);
            foreach (var s in stacks)
            {
                if (s.IsEmpty) continue;
                result.TryGetValue(s.itemId, out int c);
                result[s.itemId] = c + s.count;
            }
            return result;
        }
    }
}
