using System;

namespace Industria.Simulation.Factory
{
    /// <summary>Drill / extractor: produces a raw resource from the node it sits on.</summary>
    public sealed class ExtractorMachine : Machine
    {
        // double: avoids drift when summing thousands of small steps.
        private double _progress;

        public string ResourceItemId { get; }
        public float ItemsPerMinute { get; }

        public override float Progress01 => (float)_progress;

        public ExtractorMachine(string buildableId, string resourceItemId, float itemsPerMinute, int bufferCapacity, int outputPorts = 1)
            : base(buildableId, outputPorts, bufferCapacity)
        {
            if (string.IsNullOrEmpty(resourceItemId)) throw new ArgumentException("Extractor needs a resource.");
            ResourceItemId = resourceItemId;
            ItemsPerMinute = Math.Max(0f, itemsPerMinute);
            outputSlots.Add(new MachineSlot(resourceItemId, bufferCapacity));
        }

        // Extractors do not accept items.
        public override bool CanInsert(string itemId) => false;

        public override void Tick(float dt)
        {
            var slot = outputSlots[0];
            if (slot.IsFull)
            {
                Status = MachineStatus.OutputFull;
            }
            else if (ItemsPerMinute <= 0f)
            {
                Status = MachineStatus.Idle;
            }
            else
            {
                Status = MachineStatus.Working;
                _progress += (double)dt * ItemsPerMinute / 60.0 + 1e-9;
                while (_progress >= 1.0 && !slot.IsFull)
                {
                    _progress -= 1.0;
                    slot.Count++;
                }
                if (slot.IsFull && _progress > 1.0) _progress = 1.0;
            }
            PushOutputs();
        }

        public override MachineState CaptureState()
        {
            var s = base.CaptureState();
            s.progress = (float)_progress;
            return s;
        }

        public override void RestoreState(MachineState state)
        {
            base.RestoreState(state);
            if (state != null) _progress = Math.Max(0f, Math.Min(1f, state.progress));
        }
    }
}
