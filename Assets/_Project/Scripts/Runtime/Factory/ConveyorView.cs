using Industria.Simulation.Content;
using Industria.Simulation.Factory;
using UnityEngine;

namespace Industria.Factory
{
    /// <summary>Scene representation of a straight conveyor and its connections.</summary>
    public sealed class ConveyorView : MonoBehaviour
    {
        public BuildableDefinition Definition { get; private set; }
        public ConveyorBelt Belt { get; private set; }
        public Vector3 Start { get; private set; }
        public Vector3 End { get; private set; }

        public PortView SourcePort { get; set; }
        public ConveyorView SourceBelt { get; set; }
        public PortView TargetPort { get; set; }
        public ConveyorView TargetBelt { get; set; }

        public bool StartIsFree => SourcePort == null && SourceBelt == null;
        public bool EndIsFree => TargetPort == null && TargetBelt == null;
        public Vector3 Direction => (End - Start).normalized;
        public float Length => Vector3.Distance(Start, End);
        public Quaternion Rotation => Quaternion.LookRotation(End - Start, Vector3.up);

        public void Init(BuildableDefinition definition, ConveyorBelt belt, Vector3 start, Vector3 end)
        {
            Definition = definition;
            Belt = belt;
            Start = start;
            End = end;
        }
    }
}
