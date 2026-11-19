using Industria.Core;
using UnityEngine;

namespace Industria.UI
{
    /// <summary>F3: frame rate, frame time and factory counts, to check performance on PC and phones.</summary>
    public sealed class PerformanceOverlay
    {
        private readonly GameRoot _root;
        private float _accum;
        private int _frames;
        private float _fps, _worstMs, _worstAccum;

        public bool Visible { get; set; }

        public PerformanceOverlay(GameRoot root) { _root = root; }

        public void Tick()
        {
            float dt = Time.unscaledDeltaTime;
            _accum += dt;
            _frames++;
            _worstAccum = Mathf.Max(_worstAccum, dt * 1000f);
            if (_accum >= 0.5f)
            {
                _fps = _frames / _accum;
                _worstMs = _worstAccum;
                _accum = 0f; _frames = 0; _worstAccum = 0f;
            }
        }

        public void Draw(float width)
        {
            if (!Visible) return;
            var r = new Rect(width - 250f, 70f, 236f, 96f);
            UIStyles.Fill(r, new Color(0f, 0f, 0f, 0.55f));
            var color = _fps >= 55f ? UIStyles.Good : _fps >= 30f ? UIStyles.Accent : UIStyles.Bad;
            GUI.Label(new Rect(r.x + 10f, r.y + 6f, 220f, 22f), UIStyles.Colorize($"{_fps:F0} FPS", color) + $"   pire : {_worstMs:F1} ms", UIStyles.Label);
            var f = _root.Factory;
            GUI.Label(new Rect(r.x + 10f, r.y + 32f, 220f, 20f), $"Bâtiments : {f.Buildings.Count}   Convoyeurs : {f.Conveyors.Count}", UIStyles.Small);
            GUI.Label(new Rect(r.x + 10f, r.y + 52f, 220f, 20f), $"Ticks simulation : {f.Simulation.TickCount}", UIStyles.Small);
            GUI.Label(new Rect(r.x + 10f, r.y + 72f, 220f, 20f), $"Résolution : {Screen.width}×{Screen.height}", UIStyles.Small);
        }
    }
}
