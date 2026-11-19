using UnityEngine;

namespace Industria.Rendering
{
    /// <summary>Small, capped particle effects created from code (no assets).</summary>
    public static class EffectsFactory
    {
        private static ParticleSystem Create(string name, Transform parent, Vector3 localPos, Material mat, int maxParticles)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.transform.localPosition = localPos;
            go.layer = parent != null ? parent.gameObject.layer : 0;
            var ps = go.AddComponent<ParticleSystem>();
            ps.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
            var main = ps.main;
            main.maxParticles = maxParticles;
            main.simulationSpace = ParticleSystemSimulationSpace.World;
            main.playOnAwake = true;
            var r = go.GetComponent<ParticleSystemRenderer>();
            r.sharedMaterial = mat;
            r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            r.receiveShadows = false;
            return ps;
        }

        private static Gradient Fade(Color c, float peak)
        {
            var g = new Gradient();
            g.SetKeys(new[] { new GradientColorKey(c, 0f), new GradientColorKey(c, 1f) },
                      new[] { new GradientAlphaKey(0f, 0f), new GradientAlphaKey(peak, 0.15f), new GradientAlphaKey(0f, 1f) });
            return g;
        }

        /// <summary>Chimney smoke (enable emission while the machine works).</summary>
        public static ParticleSystem Smoke(Transform parent, Vector3 localPos, MaterialLibrary m)
        {
            var ps = Create("Fumée", parent, localPos, m.Particle(), 40);
            var main = ps.main;
            main.startLifetime = new ParticleSystem.MinMaxCurve(2.5f, 4f);
            main.startSpeed = new ParticleSystem.MinMaxCurve(0.8f, 1.4f);
            main.startSize = new ParticleSystem.MinMaxCurve(0.6f, 1.0f);
            main.startRotation = new ParticleSystem.MinMaxCurve(0f, Mathf.PI * 2f);
            main.startColor = new Color(0.55f, 0.55f, 0.55f, 1f);
            main.gravityModifier = -0.04f;
            var em = ps.emission; em.rateOverTime = 7f; em.enabled = false;
            var shape = ps.shape; shape.shapeType = ParticleSystemShapeType.Cone; shape.angle = 8f; shape.radius = 0.15f;
            shape.rotation = new Vector3(-90f, 0f, 0f);
            var size = ps.sizeOverLifetime; size.enabled = true; size.size = new ParticleSystem.MinMaxCurve(1f, AnimationCurve.Linear(0f, 0.6f, 1f, 2.6f));
            var col = ps.colorOverLifetime; col.enabled = true; col.color = Fade(new Color(0.6f, 0.6f, 0.62f), 0.45f);
            var vel = ps.velocityOverLifetime; vel.enabled = true; vel.space = ParticleSystemSimulationSpace.World;
            vel.x = new ParticleSystem.MinMaxCurve(0.3f, 0.6f); vel.y = new ParticleSystem.MinMaxCurve(0f, 0f); vel.z = new ParticleSystem.MinMaxCurve(0.1f, 0.2f);
            ps.Play();
            return ps;
        }

        /// <summary>Rock dust and grit around a working drill head.</summary>
        public static ParticleSystem Dust(Transform parent, Vector3 localPos, Color color, MaterialLibrary m)
        {
            var ps = Create("Poussière", parent, localPos, m.Particle(), 30);
            var main = ps.main;
            main.startLifetime = new ParticleSystem.MinMaxCurve(0.8f, 1.6f);
            main.startSpeed = new ParticleSystem.MinMaxCurve(0.8f, 2.2f);
            main.startSize = new ParticleSystem.MinMaxCurve(0.15f, 0.45f);
            main.startColor = color;
            main.gravityModifier = 0.35f;
            var em = ps.emission; em.rateOverTime = 14f; em.enabled = false;
            var shape = ps.shape; shape.shapeType = ParticleSystemShapeType.Hemisphere; shape.radius = 0.6f;
            shape.rotation = new Vector3(-90f, 0f, 0f);
            var col = ps.colorOverLifetime; col.enabled = true; col.color = Fade(color, 0.8f);
            ps.Play();
            return ps;
        }

        /// <summary>Large, slow floating motes around the camera (dust, pollen or volcanic ash).</summary>
        public static ParticleSystem Ambient(Transform parent, MaterialLibrary m)
        {
            var ps = Create("Ambiance", parent, Vector3.zero, m.Particle(), 70);
            var main = ps.main;
            main.startLifetime = new ParticleSystem.MinMaxCurve(6f, 10f);
            main.startSpeed = new ParticleSystem.MinMaxCurve(0.05f, 0.3f);
            main.startSize = new ParticleSystem.MinMaxCurve(0.04f, 0.12f);
            main.startColor = new Color(1f, 1f, 0.9f, 1f);
            var em = ps.emission; em.rateOverTime = 8f;
            var shape = ps.shape; shape.shapeType = ParticleSystemShapeType.Box; shape.scale = new Vector3(24f, 8f, 24f);
            var col = ps.colorOverLifetime; col.enabled = true; col.color = Fade(Color.white, 0.55f);
            var noise = ps.noise; noise.enabled = true; noise.strength = 0.25f; noise.frequency = 0.2f; noise.quality = ParticleSystemNoiseQuality.Low;
            ps.Play();
            return ps;
        }

        public static void SetEmitting(ParticleSystem ps, bool on)
        {
            if (ps == null) return;
            var em = ps.emission;
            if (em.enabled != on) em.enabled = on;
        }
    }
}
