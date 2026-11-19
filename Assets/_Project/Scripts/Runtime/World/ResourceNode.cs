using UnityEngine;

namespace Industria.World
{
    public enum ResourcePurity { Impure, Normal, Pure }

    /// <summary>An infinite ore deposit. Can be mined by hand or covered by a drill.</summary>
    public sealed class ResourceNode : MonoBehaviour
    {
        public string NodeId { get; private set; }
        public string ItemId { get; private set; }
        public ResourcePurity Purity { get; private set; }
        /// <summary>Building currently extracting from this node (null if free).</summary>
        public Component Occupant { get; set; }
        public Transform Visual { get; set; }

        private float _punch;

        public float PurityMultiplier => Purity == ResourcePurity.Impure ? 0.5f : Purity == ResourcePurity.Pure ? 2f : 1f;

        public string PurityLabel => Purity == ResourcePurity.Impure ? "Impur" : Purity == ResourcePurity.Pure ? "Pur" : "Normal";

        public void Init(string nodeId, string itemId, ResourcePurity purity)
        {
            NodeId = nodeId;
            ItemId = itemId;
            Purity = purity;
        }

        /// <summary>Small "hit" animation when mined by hand.</summary>
        public void Punch() => _punch = 1f;

        private void Update()
        {
            if (_punch <= 0f || Visual == null) return;
            _punch = Mathf.Max(0f, _punch - Time.deltaTime * 6f);
            float s = 1f + Mathf.Sin(_punch * Mathf.PI) * 0.06f;
            Visual.localScale = new Vector3(s, 1f / s, s);
        }
    }
}
