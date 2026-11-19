namespace Industria.Simulation.Factory
{
    /// <summary>Single item-type buffer of a machine.</summary>
    public sealed class MachineSlot
    {
        public string ItemId { get; }
        public int Count { get; set; }
        public int Capacity { get; }

        public MachineSlot(string itemId, int capacity)
        {
            ItemId = itemId;
            Capacity = capacity < 1 ? 1 : capacity;
        }

        public int Space => Capacity - Count;
        public bool IsFull => Count >= Capacity;
    }
}
