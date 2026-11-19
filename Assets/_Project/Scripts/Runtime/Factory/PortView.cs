using Industria.Simulation.Content;
using UnityEngine;

namespace Industria.Factory
{
    /// <summary>Runtime view of a machine port: where belts plug in.</summary>
    public sealed class PortView
    {
        public BuildingView Owner { get; }
        /// <summary>Index in the buildable's port list (used in saves).</summary>
        public int Index { get; }
        /// <summary>Index among the machine's output ports (simulation side). -1 for inputs.</summary>
        public int OutputIndex { get; }
        public PortDefinition Definition { get; }
        public ConveyorView Belt { get; set; }

        public PortView(BuildingView owner, int index, int outputIndex, PortDefinition definition)
        {
            Owner = owner;
            Index = index;
            OutputIndex = outputIndex;
            Definition = definition;
        }

        public bool IsInput => Definition.IsInput;
        public bool IsFree => Belt == null;
        public Vector3 WorldPosition => Owner.transform.TransformPoint(new Vector3(Definition.x, Definition.y, Definition.z));
        public Vector3 WorldDirection => Owner.transform.TransformDirection(new Vector3(Definition.dirX, Definition.dirY, Definition.dirZ)).normalized;
    }

    /// <summary>A candidate end point for a conveyor: a free port, a free belt end, or plain ground.</summary>
    public struct BeltAnchor
    {
        public Vector3 Position;
        public PortView Port;
        public ConveyorView Belt;

        public bool IsConnection => Port != null || Belt != null;

        public static BeltAnchor Ground(Vector3 position) => new BeltAnchor { Position = position };
    }
}
