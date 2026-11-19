using Industria.Core;
using Industria.Rendering;
using UnityEngine;

namespace Industria.Factory
{
    /// <summary>Builds the mesh of a straight belt (frame, moving surface, rails, supports).</summary>
    public static class ConveyorVisual
    {
        public const float Width = 0.8f;
        public const float BeltHeight = 0.75f;

        private static Material _surface;
        private static Texture2D _stripes;

        /// <summary>Shared animated belt material (all belts scroll together).</summary>
        public static Material SurfaceMaterial(MaterialLibrary m)
        {
            if (_surface != null) return _surface;
            if (_stripes == null) _stripes = ProceduralTextures.BeltStripes();
            _surface = m.Textured("belt_surface", _stripes, Color.white, 0.25f);
            return _surface;
        }

        public static void Build(Transform root, Vector3 start, Vector3 end, MaterialLibrary m, bool withSupports)
        {
            float length = Vector3.Distance(start, end);
            var frameMat = m.Lit(new Color(0.2f, 0.21f, 0.23f), 0.6f, 0.4f);
            var railMat = m.Lit(new Color(0.95f, 0.55f, 0.12f), 0.3f, 0.5f);

            PartBuilder.Box("Châssis", root, frameMat, new Vector3(0f, -0.1f, length * 0.5f), new Vector3(Width, 0.16f, length));
            var surface = new GameObject("Tapis");
            surface.transform.SetParent(root, false);
            surface.transform.localPosition = new Vector3(0f, -0.015f, 0f);
            surface.AddComponent<MeshFilter>().sharedMesh = MeshLibrary.BeltSurface(length, Width - 0.12f);
            var sr = surface.AddComponent<MeshRenderer>();
            sr.sharedMaterial = SurfaceMaterial(m);
            sr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            PartBuilder.Box("Rail G", root, railMat, new Vector3(-Width * 0.5f, 0.02f, length * 0.5f), new Vector3(0.06f, 0.1f, length));
            PartBuilder.Box("Rail D", root, railMat, new Vector3(Width * 0.5f, 0.02f, length * 0.5f), new Vector3(0.06f, 0.1f, length));

            if (withSupports)
            {
                AddSupport(root, start, frameMat);
                AddSupport(root, end, frameMat);
                // Intermediate supports every 8 m on long belts.
                int extra = Mathf.FloorToInt(length / 8f);
                for (int i = 1; i <= extra; i++) AddSupport(root, Vector3.Lerp(start, end, i / (float)(extra + 1)), frameMat);
            }
        }

        private static void AddSupport(Transform root, Vector3 top, Material mat)
        {
            if (!Physics.Raycast(top + Vector3.up * 0.05f, Vector3.down, out var hit, 30f, GameLayers.WorldMask, QueryTriggerInteraction.Ignore)) return;
            float h = hit.distance - 0.15f;
            if (h < 0.25f) return;
            var leg = PartBuilder.Cylinder("Support", root, mat, Vector3.zero, 0.14f, h);
            leg.transform.position = top + Vector3.down * (0.15f + h * 0.5f);
            leg.transform.rotation = Quaternion.identity;
        }

        private static float _offset;

        /// <summary>Scrolls the shared belt texture; call once per frame.</summary>
        public static void Animate(float speed, float deltaTime)
        {
            if (_surface == null) return;
            // UV unit = 0.5 m, so offset per second = speed / 0.5.
            _offset = Mathf.Repeat(_offset - deltaTime * speed / 0.5f, 1f);
            MaterialLibrary.SetTextureOffset(_surface, new Vector2(0f, _offset));
        }

        public static void ResetCache()
        {
            _surface = null;
        }
    }
}
