using Industria.Core;
using Industria.Input;
using UnityEngine;

namespace Industria.Player
{
    /// <summary>Orbit camera over the shoulder with zoom and obstacle avoidance.</summary>
    public sealed class ThirdPersonCamera : MonoBehaviour
    {
        public float PivotHeight = 1.6f;
        public float ShoulderOffset = 0.55f;
        public float MinDistance = 2.2f;
        public float MaxDistance = 14f;
        public float MinPitch = -40f;
        public float MaxPitch = 75f;
        public float CollisionRadius = 0.25f;

        private GameInput _input;
        private Transform _target;
        private float _distance = 5.5f;
        private float _currentDistance = 5.5f;

        public Camera Camera { get; private set; }
        public float Yaw { get; set; }
        public float Pitch { get; set; } = 15f;
        /// <summary>Point orbited by the camera while there is no target (main menu).</summary>
        public Vector3 MenuFocus { get; set; }
        /// <summary>When false the camera ignores look input (cursor free for menus).</summary>
        public bool LookEnabled { get; set; } = true;

        public Ray AimRay => new Ray(transform.position, transform.forward);
        public Vector3 Pivot => _target != null ? _target.position + Vector3.up * PivotHeight : transform.position;

        public static ThirdPersonCamera Create(GameInput input)
        {
            var go = new GameObject("Main Camera") { tag = "MainCamera" };
            var cam = go.AddComponent<Camera>();
            cam.nearClipPlane = 0.1f;
            cam.farClipPlane = 1400f;
            cam.fieldOfView = 62f;
            cam.clearFlags = CameraClearFlags.Skybox;
            go.AddComponent<AudioListener>();
            var rig = go.AddComponent<ThirdPersonCamera>();
            rig._input = input;
            rig.Camera = cam;
            return rig;
        }

        public void SetTarget(Transform target, float yaw)
        {
            _target = target;
            Yaw = yaw;
            Pitch = 15f;
            SnapToTarget();
        }

        public void SnapToTarget()
        {
            _currentDistance = _distance;
            Place(1f);
        }

        private void LateUpdate()
        {
            if (_target == null)
            {
                // Main menu: slow cinematic orbit around the spawn valley.
                Yaw += Time.deltaTime * 2.5f;
                var orbit = Quaternion.Euler(14f, Yaw, 0f);
                transform.SetPositionAndRotation(MenuFocus + orbit * new Vector3(0f, 0f, -95f) + Vector3.up * 22f, orbit);
                return;
            }

            if (LookEnabled)
            {
                var look = _input.GameplayLook;
                Yaw += look.x;
                Pitch = Mathf.Clamp(Pitch - look.y, MinPitch, MaxPitch);
                float zoom = _input.GameplayZoom;
                if (Mathf.Abs(zoom) > 0.01f && !ZoomLocked) _distance = Mathf.Clamp(_distance - zoom * 0.8f, MinDistance, MaxDistance);
            }
            Place(Time.deltaTime);
        }

        /// <summary>Set by build mode, which uses the mouse wheel for rotation.</summary>
        public bool ZoomLocked { get; set; }

        private void Place(float dt)
        {
            var rot = Quaternion.Euler(Pitch, Yaw, 0f);
            var pivot = Pivot;
            var shoulder = pivot + rot * new Vector3(ShoulderOffset, 0f, 0f);
            var back = rot * Vector3.back;

            float allowed = _distance;
            if (Physics.SphereCast(shoulder, CollisionRadius, back, out var hit, _distance, GameLayers.WorldMask, QueryTriggerInteraction.Ignore))
                allowed = Mathf.Max(0.4f, hit.distance - 0.05f);

            // Pull in instantly, ease out smoothly.
            _currentDistance = allowed < _currentDistance ? allowed : Mathf.Lerp(_currentDistance, allowed, 1f - Mathf.Exp(-6f * dt));
            transform.SetPositionAndRotation(shoulder + back * _currentDistance, rot);
        }
    }
}
