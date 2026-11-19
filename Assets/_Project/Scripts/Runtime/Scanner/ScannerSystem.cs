using System.Collections.Generic;
using Industria.Core;
using Industria.Input;
using Industria.World;
using UnityEngine;

namespace Industria.Scanner
{
    /// <summary>Pulse scanner: reveals nearby resource deposits as HUD markers for a while.</summary>
    public sealed class ScannerSystem
    {
        public struct Marker
        {
            public ResourceNode Node;
            public float ExpiresAt;
        }

        public const float Range = 300f;
        public const float MarkerDuration = 25f;
        public const float Cooldown = 3f;
        public const float PulseDuration = 1.2f;

        private readonly List<Marker> _markers = new List<Marker>();
        private float _lastScan = -100f;

        public IReadOnlyList<Marker> Markers => _markers;
        public float PulseStartedAt => _lastScan;
        public bool PulseActive => Time.time - _lastScan < PulseDuration;

        public void Update(GameRoot root)
        {
            float now = Time.time;
            _markers.RemoveAll(m => m.Node == null || m.ExpiresAt < now);
            if (root.State != GameState.Playing) return;
            if (root.Input.Pressed(GameAction.Scanner)) Scan(root);
        }

        public void Scan(GameRoot root)
        {
            float now = Time.time;
            if (now - _lastScan < Cooldown)
            {
                root.Notifications.Push("Scanner en recharge…", NotificationKind.Warning, 1.2f);
                return;
            }
            _lastScan = now;
            _markers.Clear();
            var origin = root.Player.transform.position;
            int found = 0;
            foreach (var node in root.World.Nodes)
            {
                if (node == null) continue;
                if ((node.transform.position - origin).sqrMagnitude > Range * Range) continue;
                _markers.Add(new Marker { Node = node, ExpiresAt = now + MarkerDuration });
                found++;
            }
            root.Notifications.Push(found > 0 ? $"Scanner : {found} gisement(s) détecté(s) dans un rayon de {Range:F0} m" : "Scanner : aucun gisement à proximité",
                found > 0 ? NotificationKind.Success : NotificationKind.Info);
        }

        public void Clear() => _markers.Clear();
    }
}
