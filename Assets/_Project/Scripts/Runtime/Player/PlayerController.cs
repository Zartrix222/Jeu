using System;
using Industria.Core;
using Industria.Input;
using UnityEngine;

namespace Industria.Player
{
    /// <summary>Third-person character movement: walk, sprint, jump, gravity, camera-relative steering.</summary>
    [RequireComponent(typeof(CharacterController))]
    public sealed class PlayerController : MonoBehaviour
    {
        public float WalkSpeed = 4.5f;
        public float SprintSpeed = 8.5f;
        public float JumpHeight = 1.25f;
        public float Gravity = -22f;
        public float GroundAcceleration = 40f;
        public float AirAcceleration = 10f;
        public float TurnSpeed = 720f;

        private CharacterController _cc;
        private GameInput _input;
        private Transform _camera;
        private Func<Vector3, float> _groundHeight;
        private Vector3 _horizontal;
        private float _vertical;
        private float _coyote;
        private float _jumpBuffer;

        public bool IsGrounded { get; private set; }
        public float HorizontalSpeed => _horizontal.magnitude;
        public float Yaw => transform.eulerAngles.y;
        /// <summary>When false the character ignores movement input (menus, cut-scenes).</summary>
        public bool ControlsEnabled { get; set; } = true;

        public static PlayerController Create(GameInput input, Transform camera, Func<Vector3, float> groundHeight)
        {
            var go = new GameObject("Player");
            go.layer = GameLayers.IgnoreRaycast;
            var cc = go.AddComponent<CharacterController>();
            cc.height = 1.8f;
            cc.radius = 0.35f;
            cc.center = new Vector3(0f, 0.9f, 0f);
            cc.slopeLimit = 50f;
            cc.stepOffset = 0.4f;
            cc.skinWidth = 0.04f;
            var pc = go.AddComponent<PlayerController>();
            pc._input = input;
            pc._camera = camera;
            pc._groundHeight = groundHeight;
            return pc;
        }

        private void Awake() => _cc = GetComponent<CharacterController>();

        private void Update()
        {
            float dt = Time.deltaTime;
            if (dt <= 0f) return;

            Vector2 move = ControlsEnabled ? _input.GameplayMove : Vector2.zero;
            bool sprint = ControlsEnabled && _input.Held(GameAction.Sprint);

            Vector3 fwd = _camera != null ? _camera.forward : Vector3.forward;
            fwd.y = 0f;
            if (fwd.sqrMagnitude < 0.0001f) fwd = transform.forward;
            fwd.Normalize();
            var right = new Vector3(fwd.z, 0f, -fwd.x);
            var desired = Vector3.ClampMagnitude(fwd * move.y + right * move.x, 1f) * (sprint ? SprintSpeed : WalkSpeed);

            IsGrounded = _cc.isGrounded;
            _horizontal = Vector3.MoveTowards(_horizontal, desired, (IsGrounded ? GroundAcceleration : AirAcceleration) * dt);

            if (desired.sqrMagnitude > 0.01f)
            {
                var target = Quaternion.LookRotation(desired, Vector3.up);
                transform.rotation = Quaternion.RotateTowards(transform.rotation, target, TurnSpeed * dt);
            }

            // Jump with coyote time and input buffering for a forgiving feel.
            _coyote = IsGrounded ? 0.12f : _coyote - dt;
            _jumpBuffer = ControlsEnabled && _input.Pressed(GameAction.Jump) ? 0.15f : _jumpBuffer - dt;
            if (IsGrounded && _vertical < 0f) _vertical = -2f;
            if (_jumpBuffer > 0f && _coyote > 0f)
            {
                _vertical = Mathf.Sqrt(-2f * Gravity * JumpHeight);
                _jumpBuffer = 0f;
                _coyote = 0f;
            }
            _vertical += Gravity * dt;

            _cc.Move((_horizontal + Vector3.up * _vertical) * dt);

            // Safety: fell through the world.
            if (_groundHeight != null)
            {
                float ground = _groundHeight(transform.position);
                if (transform.position.y < ground - 6f) Teleport(new Vector3(transform.position.x, ground + 1f, transform.position.z), Yaw);
            }
        }

        public void Teleport(Vector3 position, float yaw)
        {
            _cc.enabled = false;
            transform.SetPositionAndRotation(position, Quaternion.Euler(0f, yaw, 0f));
            _cc.enabled = true;
            _horizontal = Vector3.zero;
            _vertical = 0f;
        }
    }
}
