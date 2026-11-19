using System;
using System.Collections.Generic;

namespace Industria.Simulation.Factory
{
    /// <summary>
    /// Straight conveyor segment. Items move from position 0 (start) to <see cref="Length"/> (end),
    /// keep a minimum spacing, and are handed to <see cref="OutputTarget"/> when they reach the end.
    /// </summary>
    public sealed class ConveyorBelt : FactoryEntity, IItemAcceptor
    {
        public struct BeltItem
        {
            public string ItemId;
            public float Position;
            /// <summary>True when the item advanced during the last tick (used for render interpolation).</summary>
            public bool Moving;
        }

        public const float DefaultSpacing = 0.5f;

        // Index 0 = the item closest to the end of the belt.
        private readonly List<BeltItem> _items = new List<BeltItem>();

        public float Length { get; }
        public float Speed { get; }
        public float Spacing { get; }
        public IItemAcceptor OutputTarget { get; set; }
        public IReadOnlyList<BeltItem> Items => _items;
        public int Capacity => Math.Max(1, (int)Math.Floor(Length / Spacing) + 1);

        public ConveyorBelt(string buildableId, float length, float speed, float spacing = DefaultSpacing) : base(buildableId)
        {
            if (length <= 0f) throw new ArgumentOutOfRangeException(nameof(length));
            if (speed <= 0f) throw new ArgumentOutOfRangeException(nameof(speed));
            Length = length;
            Speed = speed;
            Spacing = spacing > 0f ? spacing : DefaultSpacing;
        }

        public bool CanInsert(string itemId)
        {
            if (string.IsNullOrEmpty(itemId)) return false;
            if (_items.Count == 0) return true;
            if (_items.Count >= Capacity) return false;
            return _items[_items.Count - 1].Position >= Spacing;
        }

        public bool TryInsert(string itemId)
        {
            if (!CanInsert(itemId)) return false;
            _items.Add(new BeltItem { ItemId = itemId, Position = 0f, Moving = true });
            return true;
        }

        public override void Tick(float dt)
        {
            float step = Speed * dt;
            for (int i = 0; i < _items.Count; i++)
            {
                var item = _items[i];
                float limit = i == 0 ? Length : _items[i - 1].Position - Spacing;
                float target = Math.Min(item.Position + step, limit);
                if (target < item.Position) target = item.Position; // never move backwards
                item.Moving = target > item.Position + 1e-5f;
                item.Position = target;
                _items[i] = item;
            }

            // Hand over the front item.
            if (_items.Count > 0 && _items[0].Position >= Length - 1e-4f && OutputTarget != null)
            {
                if (OutputTarget.TryInsert(_items[0].ItemId)) _items.RemoveAt(0);
            }
        }

        public override void ClearReferencesTo(FactoryEntity removed)
        {
            if (ReferenceEquals(OutputTarget, removed)) OutputTarget = null;
        }

        /// <summary>Removes every item and returns them (used on deconstruction).</summary>
        public List<string> TakeAllItems()
        {
            var list = new List<string>(_items.Count);
            foreach (var it in _items) list.Add(it.ItemId);
            _items.Clear();
            return list;
        }

        public List<BeltItemState> CaptureItems()
        {
            var list = new List<BeltItemState>(_items.Count);
            foreach (var it in _items) list.Add(new BeltItemState { itemId = it.ItemId, position = it.Position });
            return list;
        }

        public void RestoreItems(IEnumerable<BeltItemState> items)
        {
            _items.Clear();
            if (items == null) return;
            var sorted = new List<BeltItemState>(items);
            sorted.Sort((a, b) => b.position.CompareTo(a.position));
            foreach (var it in sorted)
            {
                if (string.IsNullOrEmpty(it.itemId) || _items.Count >= Capacity) continue;
                float pos = Math.Max(0f, Math.Min(Length, it.position));
                if (_items.Count > 0) pos = Math.Min(pos, _items[_items.Count - 1].Position - Spacing);
                if (pos < 0f) continue;
                _items.Add(new BeltItem { ItemId = it.itemId, Position = pos });
            }
        }
    }

    [Serializable]
    public struct BeltItemState
    {
        public string itemId;
        public float position;
    }
}
