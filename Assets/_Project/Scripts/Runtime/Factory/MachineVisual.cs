using Industria.Simulation.Factory;
using UnityEngine;

namespace Industria.Factory
{
    /// <summary>Animates a machine from its simulation status (spinning parts, glow, status light).</summary>
    public sealed class MachineVisual : MonoBehaviour
    {
        public Transform Spinner;
        public Vector3 SpinAxis = Vector3.up;
        public float SpinSpeed = 360f;
        public Renderer Glow;
        public Material GlowOn, GlowOff;
        public Renderer StatusLight;
        public Material StatusWorking, StatusWaiting, StatusBlocked;

        private Machine _machine;
        private MachineStatus _lastStatus = (MachineStatus)(-1);
        private float _spinVelocity;

        public void Bind(Machine machine) => _machine = machine;

        private void LateUpdate()
        {
            if (_machine == null) return;
            var status = _machine.Status;
            bool working = status == MachineStatus.Working;

            if (status != _lastStatus)
            {
                _lastStatus = status;
                if (Glow != null && GlowOn != null) Glow.sharedMaterial = working ? GlowOn : GlowOff;
                if (StatusLight != null)
                    StatusLight.sharedMaterial = working ? StatusWorking : status == MachineStatus.OutputFull ? StatusBlocked : StatusWaiting;
            }

            if (Spinner != null)
            {
                _spinVelocity = Mathf.MoveTowards(_spinVelocity, working ? SpinSpeed : 0f, SpinSpeed * Time.deltaTime);
                if (_spinVelocity > 0.01f) Spinner.Rotate(SpinAxis, _spinVelocity * Time.deltaTime, Space.Self);
            }
        }
    }
}
