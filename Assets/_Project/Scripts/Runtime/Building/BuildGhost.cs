using System;
using Industria.Core;
using Industria.Factory;
using Industria.Rendering;
using UnityEngine;

namespace Industria.Building
{
    /// <summary>Transparent preview of the object being placed (green = valid, red = invalid).</summary>
    public sealed class BuildGhost
    {
        private readonly Material _valid;
        private readonly Material _invalid;
        private GameObject _go;
        private string _key;
        private Renderer[] _renderers;
        private bool? _lastValid;

        public BuildGhost(MaterialLibrary materials)
        {
            _valid = materials.Ghost(new Color(0.2f, 0.85f, 1f, 0.38f));
            _invalid = materials.Ghost(new Color(1f, 0.2f, 0.15f, 0.38f));
        }

        public GameObject Object => _go;

        public void Show(string key, Func<GameObject> factory)
        {
            if (_go != null && _key == key) { _go.SetActive(true); return; }
            Destroy();
            _key = key;
            _go = factory();
            _go.name = "Ghost " + key;
            PartBuilder.SetLayerRecursive(_go, GameLayers.IgnoreRaycast);
            foreach (var c in _go.GetComponentsInChildren<Collider>()) UnityEngine.Object.Destroy(c);
            foreach (var mb in _go.GetComponentsInChildren<MachineVisual>()) mb.enabled = false;
            _renderers = _go.GetComponentsInChildren<Renderer>();
            foreach (var r in _renderers) r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            _lastValid = null;
        }

        public void SetPose(Vector3 position, Quaternion rotation)
        {
            if (_go != null) _go.transform.SetPositionAndRotation(position, rotation);
        }

        public void SetValid(bool valid)
        {
            if (_renderers == null || _lastValid == valid) return;
            _lastValid = valid;
            var mat = valid ? _valid : _invalid;
            foreach (var r in _renderers)
            {
                if (r == null) continue;
                var mats = r.sharedMaterials;
                for (int i = 0; i < mats.Length; i++) mats[i] = mat;
                r.sharedMaterials = mats;
            }
        }

        public void Hide()
        {
            if (_go != null) _go.SetActive(false);
        }

        public void Destroy()
        {
            if (_go != null) UnityEngine.Object.Destroy(_go);
            _go = null;
            _key = null;
            _renderers = null;
        }
    }
}
