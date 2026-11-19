using Industria.Rendering;
using UnityEngine;

namespace Industria.World
{
    /// <summary>
    /// Floating particles around the camera whose look depends on the biome and time of day:
    /// pollen in the valley, sand in the desert, ash in the volcanic zone, fireflies in forests at night.
    /// One capped particle system for the whole game.
    /// </summary>
    public sealed class AmbientEffects : MonoBehaviour
    {
        private ParticleSystem _ps;
        private Transform _follow;
        private WorldGenerator _world;
        private DayNightCycle _cycle;
        private float _nextCheck;

        public void Init(Transform follow, WorldGenerator world, DayNightCycle cycle, MaterialLibrary materials)
        {
            _follow = follow;
            _world = world;
            _cycle = cycle;
            _ps = EffectsFactory.Ambient(transform, materials);
        }

        private void LateUpdate()
        {
            if (_follow == null || _ps == null) return;
            transform.position = _follow.position;
            if (Time.time < _nextCheck || _world == null || _world.Shape == null) return;
            _nextCheck = Time.time + 1f;

            var p = _follow.position;
            float slope = 0f;
            var biome = _world.Shape.BiomeAt(p.x, p.z, p.y / WorldShape.MaxHeight, slope);
            bool night = _cycle != null && _cycle.IsNight;
            Color c; float rate;
            switch (biome)
            {
                case Biome.Volcanic: c = new Color(0.25f, 0.22f, 0.2f); rate = 22f; break;
                case Biome.Desert: c = new Color(0.9f, 0.75f, 0.5f); rate = 14f; break;
                case Biome.Forest: c = night ? new Color(0.4f, 1f, 0.8f) : new Color(1f, 1f, 0.85f); rate = night ? 14f : 6f; break;
                default: c = night ? new Color(0.6f, 0.7f, 1f) : new Color(1f, 1f, 0.9f); rate = 5f; break;
            }
            var main = _ps.main;
            main.startColor = c;
            var em = _ps.emission;
            em.rateOverTime = rate;
        }
    }
}
