using Industria.Rendering;
using UnityEngine;

namespace Industria.Player
{
    /// <summary>
    /// Procedural placeholder character (pioneer in an exo-suit) with a simple code-driven walk cycle.
    /// Will be replaced by a rigged, animated model later; gameplay does not depend on it.
    /// </summary>
    public sealed class PlayerAvatar : MonoBehaviour
    {
        private Transform _body, _legL, _legR, _armL, _armR, _toolArm;
        private float _phase;
        private PlayerController _controller;

        /// <summary>Set by the interactor while mining so the arm swings.</summary>
        public bool Working { get; set; }

        public static PlayerAvatar Build(Transform parent, MaterialLibrary m)
        {
            var root = new GameObject("Avatar");
            root.transform.SetParent(parent, false);
            var avatar = root.AddComponent<PlayerAvatar>();

            var suit = m.Lit(new Color(0.85f, 0.86f, 0.88f), 0.2f, 0.55f);
            var dark = m.Lit(new Color(0.12f, 0.13f, 0.15f), 0.5f, 0.4f);
            var accent = m.Lit(new Color(0.95f, 0.55f, 0.12f), 0.3f, 0.5f);
            var visor = m.Emissive(new Color(0.05f, 0.25f, 0.35f), new Color(0.2f, 1.4f, 2.0f));

            avatar._body = new GameObject("Corps").transform;
            avatar._body.SetParent(root.transform, false);
            var b = avatar._body;
            PartBuilder.Part("Torse", b, MeshLibrary.Capsule, suit, new Vector3(0f, 1.18f, 0f), new Vector3(0.62f, 0.42f, 0.42f));
            PartBuilder.Box("Ceinture", b, dark, new Vector3(0f, 0.9f, 0f), new Vector3(0.6f, 0.12f, 0.4f));
            PartBuilder.Box("Plastron", b, accent, new Vector3(0f, 1.3f, 0.19f), new Vector3(0.36f, 0.22f, 0.06f));
            PartBuilder.Part("Casque", b, MeshLibrary.Sphere, suit, new Vector3(0f, 1.66f, 0f), new Vector3(0.42f, 0.42f, 0.42f));
            PartBuilder.Box("Visière", b, visor, new Vector3(0f, 1.67f, 0.15f), new Vector3(0.32f, 0.14f, 0.14f));
            PartBuilder.Box("Sac", b, dark, new Vector3(0f, 1.22f, -0.3f), new Vector3(0.48f, 0.55f, 0.24f));
            PartBuilder.Cylinder("Réservoir", b, accent, new Vector3(0.14f, 1.25f, -0.44f), 0.14f, 0.45f);
            PartBuilder.Cylinder("Réservoir 2", b, accent, new Vector3(-0.14f, 1.25f, -0.44f), 0.14f, 0.45f);

            avatar._legL = Limb("Jambe G", root.transform, new Vector3(-0.15f, 0.82f, 0f), 0.2f, 0.8f, suit, dark);
            avatar._legR = Limb("Jambe D", root.transform, new Vector3(0.15f, 0.82f, 0f), 0.2f, 0.8f, suit, dark);
            avatar._armL = Limb("Bras G", b, new Vector3(-0.4f, 1.42f, 0f), 0.15f, 0.62f, suit, dark);
            avatar._armR = Limb("Bras D", b, new Vector3(0.4f, 1.42f, 0f), 0.15f, 0.62f, suit, dark);
            // Mining tool in the right hand.
            PartBuilder.Box("Outil", avatar._armR, accent, new Vector3(0f, -0.62f, 0.15f), new Vector3(0.08f, 0.08f, 0.4f));
            avatar._toolArm = avatar._armR;
            // The avatar must never block the player's own interaction / camera raycasts.
            PartBuilder.SetLayerRecursive(root, Industria.Core.GameLayers.IgnoreRaycast);
            return avatar;
        }

        private static Transform Limb(string name, Transform parent, Vector3 pivot, float thickness, float length, Material mat, Material end)
        {
            var p = new GameObject(name).transform;
            p.SetParent(parent, false);
            p.localPosition = pivot;
            PartBuilder.Box("Segment", p, mat, new Vector3(0f, -length * 0.5f, 0f), new Vector3(thickness, length, thickness));
            PartBuilder.Box("Extrémité", p, end, new Vector3(0f, -length + 0.05f, 0.03f), new Vector3(thickness * 1.1f, 0.12f, thickness * 1.4f));
            return p;
        }

        private void Awake() => _controller = GetComponentInParent<PlayerController>();

        private void LateUpdate()
        {
            if (_controller == null) return;
            float speed = _controller.HorizontalSpeed;
            bool grounded = _controller.IsGrounded;
            _phase += Time.deltaTime * Mathf.Lerp(0f, 9f, Mathf.Clamp01(speed / 8f)) + Time.deltaTime * (speed > 0.1f ? 3f : 0f);
            float amount = Mathf.Clamp01(speed / 4.5f) * (grounded ? 1f : 0.3f);
            float swing = Mathf.Sin(_phase) * 38f * amount;

            _legL.localRotation = Quaternion.Euler(swing, 0f, 0f);
            _legR.localRotation = Quaternion.Euler(-swing, 0f, 0f);
            _armL.localRotation = Quaternion.Euler(-swing * 0.8f, 0f, 0f);
            if (Working)
                _toolArm.localRotation = Quaternion.Euler(-70f + Mathf.Sin(Time.time * 14f) * 35f, 0f, 0f);
            else
                _armR.localRotation = Quaternion.Euler(swing * 0.8f, 0f, 0f);

            float bob = Mathf.Abs(Mathf.Cos(_phase)) * 0.05f * amount;
            _body.localPosition = new Vector3(0f, bob, 0f);
            if (!grounded) _body.localRotation = Quaternion.Euler(8f, 0f, 0f);
            else _body.localRotation = Quaternion.Euler(Mathf.Clamp(speed, 0f, 8f) * 1.2f, 0f, 0f);
        }
    }
}
