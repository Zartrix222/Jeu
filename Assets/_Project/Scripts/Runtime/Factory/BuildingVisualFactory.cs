using Industria.Rendering;
using Industria.Simulation.Content;
using UnityEngine;

namespace Industria.Factory
{
    /// <summary>
    /// Builds the 3D look of each buildable out of simple shapes. Placeholder art with a consistent
    /// industrial palette; real models can later replace an archetype without touching gameplay code.
    /// Pivot convention: bottom centre, +Z = front.
    /// </summary>
    public sealed class BuildingVisualFactory
    {
        private readonly MaterialLibrary _m;
        private Material _concrete;

        // Palette
        private static readonly Color Steel = new Color(0.36f, 0.39f, 0.42f);
        private static readonly Color DarkSteel = new Color(0.16f, 0.17f, 0.19f);
        private static readonly Color Accent = new Color(0.95f, 0.55f, 0.12f);   // industria orange
        private static readonly Color Hazard = new Color(0.92f, 0.78f, 0.15f);
        private static readonly Color InputColor = new Color(0.15f, 0.65f, 1f);
        private static readonly Color OutputColor = new Color(1f, 0.5f, 0.1f);

        public BuildingVisualFactory(MaterialLibrary materials) { _m = materials; }

        public GameObject Create(BuildableDefinition def, out MachineVisual machineVisual)
        {
            var root = new GameObject(def.displayName);
            machineVisual = null;
            switch (def.visual)
            {
                case "smelter": machineVisual = BuildSmelter(root.transform, def); break;
                case "drill": machineVisual = BuildDrill(root.transform, def); break;
                case "foundation": BuildFoundation(root.transform, def); break;
                default: BuildGeneric(root.transform, def); break;
            }
            AddPortMarkers(root.transform, def);
            return root;
        }

        private MachineVisual AddStatus(Transform root, Vector3 lightPos)
        {
            var mv = root.gameObject.AddComponent<MachineVisual>();
            var light = PartBuilder.Part("Voyant", root, MeshLibrary.Sphere, _m.Emissive(Color.gray, Color.gray * 0.3f), lightPos, Vector3.one * 0.28f, null, false);
            mv.StatusLight = light.GetComponent<Renderer>();
            mv.StatusWorking = _m.Emissive(new Color(0.1f, 0.6f, 0.2f), new Color(0.2f, 2.2f, 0.4f));
            mv.StatusWaiting = _m.Emissive(new Color(0.6f, 0.5f, 0.1f), new Color(1.8f, 1.3f, 0.1f));
            mv.StatusBlocked = _m.Emissive(new Color(0.6f, 0.1f, 0.1f), new Color(2.2f, 0.2f, 0.15f));
            mv.StatusLight.sharedMaterial = mv.StatusWaiting;
            return mv;
        }

        private MachineVisual BuildSmelter(Transform t, BuildableDefinition def)
        {
            var steel = _m.Lit(Steel, 0.7f, 0.45f);
            var dark = _m.Lit(DarkSteel, 0.6f, 0.35f);
            var accent = _m.Lit(Accent, 0.3f, 0.5f);
            var hazard = _m.Lit(Hazard, 0.2f, 0.4f);
            float w = def.sizeX, d = def.sizeZ;

            PartBuilder.Box("Socle", t, dark, new Vector3(0f, 0.15f, 0f), new Vector3(w, 0.3f, d));
            PartBuilder.Box("Bande", t, hazard, new Vector3(0f, 0.31f, 0f), new Vector3(w + 0.02f, 0.04f, d + 0.02f));
            PartBuilder.Box("Corps", t, steel, new Vector3(0f, 1.35f, -0.1f), new Vector3(w - 0.4f, 2.1f, d - 0.9f));
            PartBuilder.Box("Toit", t, dark, new Vector3(0f, 2.48f, -0.1f), new Vector3(w - 0.2f, 0.16f, d - 0.7f));
            PartBuilder.Cylinder("Cheminée", t, dark, new Vector3(0.6f, 2.9f, -1.0f), 0.55f, 1.0f);
            PartBuilder.Cylinder("Cheminée haut", t, accent, new Vector3(0.6f, 3.1f, -1.0f), 0.62f, 0.15f);
            PartBuilder.Box("Trémie", t, accent, new Vector3(0f, 0.75f, -d * 0.5f + 0.3f), new Vector3(1.0f, 0.7f, 0.6f));
            PartBuilder.Box("Goulotte", t, accent, new Vector3(0f, 0.75f, d * 0.5f - 0.3f), new Vector3(1.0f, 0.7f, 0.6f));
            var window = PartBuilder.Box("Fenêtre foyer", t, dark, new Vector3(0f, 1.3f, d * 0.5f - 0.54f), new Vector3(1.4f, 0.8f, 0.05f));

            var mv = AddStatus(t, new Vector3(-w * 0.5f + 0.35f, 2.65f, d * 0.5f - 0.5f));
            mv.Glow = window.GetComponent<Renderer>();
            mv.GlowOff = _m.Lit(new Color(0.08f, 0.05f, 0.04f), 0.2f, 0.7f);
            mv.GlowOn = _m.Emissive(new Color(0.9f, 0.35f, 0.05f), new Color(3.2f, 1.1f, 0.15f));
            mv.Glow.sharedMaterial = mv.GlowOff;
            return mv;
        }

        private MachineVisual BuildDrill(Transform t, BuildableDefinition def)
        {
            var steel = _m.Lit(Steel, 0.75f, 0.45f);
            var dark = _m.Lit(DarkSteel, 0.6f, 0.35f);
            var accent = _m.Lit(Accent, 0.3f, 0.5f);
            var hazard = _m.Lit(Hazard, 0.2f, 0.4f);
            float w = def.sizeX;

            PartBuilder.Box("Plateforme", t, dark, new Vector3(0f, 0.35f, 0f), new Vector3(w, 0.25f, w));
            PartBuilder.Box("Bande", t, hazard, new Vector3(0f, 0.49f, 0f), new Vector3(w + 0.02f, 0.04f, w + 0.02f));
            for (int i = 0; i < 4; i++)
            {
                float sx = (i % 2 == 0 ? 1f : -1f) * (w * 0.5f - 0.2f);
                float sz = (i < 2 ? 1f : -1f) * (w * 0.5f - 0.2f);
                PartBuilder.Box("Pied", t, dark, new Vector3(sx, 0.2f, sz), new Vector3(0.3f, 0.4f, 0.3f));
                PartBuilder.Box("Montant", t, steel, new Vector3(sx * 0.55f, 2.2f, sz * 0.55f), new Vector3(0.18f, 3.4f, 0.18f));
            }
            PartBuilder.Box("Moteur", t, accent, new Vector3(0f, 3.9f, 0f), new Vector3(1.4f, 0.9f, 1.4f));
            PartBuilder.Box("Capot", t, dark, new Vector3(0f, 4.42f, 0f), new Vector3(1.0f, 0.15f, 1.0f));

            var spinner = new GameObject("Foret").transform;
            spinner.SetParent(t, false);
            spinner.localPosition = new Vector3(0f, 1.0f, 0f);
            PartBuilder.Cylinder("Arbre", spinner, steel, new Vector3(0f, 1.3f, 0f), 0.35f, 2.6f);
            PartBuilder.Part("Tête", spinner, MeshLibrary.Cone, dark, new Vector3(0f, 0f, 0f), new Vector3(0.9f, -1.2f, 0.9f));
            for (int i = 0; i < 3; i++)
                PartBuilder.Box("Pale", spinner, hazard, new Vector3(0f, 0.9f + i * 0.5f, 0f), new Vector3(0.95f, 0.06f, 0.12f), Quaternion.Euler(0f, i * 60f, 0f));

            PartBuilder.Box("Goulotte", t, accent, new Vector3(0f, 0.75f, w * 0.5f - 0.25f), new Vector3(0.9f, 0.5f, 0.5f));

            var mv = AddStatus(t, new Vector3(0.55f, 4.6f, 0.55f));
            mv.Spinner = spinner;
            mv.SpinSpeed = 300f;
            return mv;
        }

        private void BuildFoundation(Transform t, BuildableDefinition def)
        {
            if (_concrete == null)
                _concrete = _m.Textured("concrete", ProceduralTextures.Noise("concrete", new Color(0.46f, 0.47f, 0.48f), new Color(0.6f, 0.61f, 0.6f), 9f, 128, 9), Color.white, 0.2f);
            var trim = _m.Lit(DarkSteel, 0.6f, 0.4f);
            PartBuilder.Box("Dalle", t, _concrete, new Vector3(0f, def.sizeY * 0.5f, 0f), new Vector3(def.sizeX, def.sizeY, def.sizeZ));
            PartBuilder.Box("Bordure", t, trim, new Vector3(0f, def.sizeY - 0.02f, 0f), new Vector3(def.sizeX + 0.02f, 0.06f, def.sizeZ + 0.02f));
            PartBuilder.Box("Plaque", t, _concrete, new Vector3(0f, def.sizeY + 0.005f, 0f), new Vector3(def.sizeX - 0.25f, 0.04f, def.sizeZ - 0.25f));
        }

        private void BuildGeneric(Transform t, BuildableDefinition def)
        {
            PartBuilder.Box("Bloc", t, _m.Lit(Steel, 0.6f, 0.4f), new Vector3(0f, def.sizeY * 0.5f, 0f), new Vector3(def.sizeX, def.sizeY, def.sizeZ));
        }

        private void AddPortMarkers(Transform t, BuildableDefinition def)
        {
            if (def.ports == null) return;
            foreach (var p in def.ports)
            {
                var color = p.IsInput ? InputColor : OutputColor;
                var mat = _m.Emissive(color * 0.6f, color * 1.6f);
                var dir = new Vector3(p.dirX, p.dirY, p.dirZ);
                if (dir.sqrMagnitude < 0.001f) dir = Vector3.forward;
                var rot = Quaternion.LookRotation(dir.normalized, Vector3.up);
                var marker = PartBuilder.Box(p.IsInput ? "Port entrée" : "Port sortie", t, mat, new Vector3(p.x, p.y, p.z), new Vector3(0.7f, 0.5f, 0.08f), rot);
                marker.GetComponent<Renderer>().shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
                // Arrow tip showing the item flow direction (out of outputs, into inputs).
                var tipDir = p.IsInput ? -dir.normalized : dir.normalized;
                PartBuilder.Part("Flèche", t, MeshLibrary.Cone, mat, new Vector3(p.x, p.y + 0.42f, p.z) + dir.normalized * 0.05f,
                    new Vector3(0.25f, 0.3f, 0.25f), Quaternion.FromToRotation(Vector3.up, tipDir), false);
            }
        }

        /// <summary>Box collider matching the buildable footprint (pivot bottom centre).</summary>
        public static void AddCollider(GameObject go, BuildableDefinition def)
        {
            var box = go.AddComponent<BoxCollider>();
            box.center = new Vector3(0f, def.sizeY * 0.5f, 0f);
            box.size = new Vector3(def.sizeX, def.sizeY, def.sizeZ);
        }
    }
}
