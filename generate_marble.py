"""
Erzeugt die nahtlos kachelbare Marmor-Bildtextur (türkis / dunkelblau) für den Torus.
Eigenes Skript, keine fremden Bilddaten. Aufruf:  python3 tools/generate_marble.py
Benötigt: numpy, Pillow
"""
import numpy as np
from PIL import Image

W, H = 2048, 1024
rng = np.random.default_rng(42)

def periodic_noise(beta, seed):
    """Nahtlos kachelbares 1/f^beta-Rauschen (Filterung im Frequenzraum), Wertebereich 0..1."""
    r = np.random.default_rng(seed)
    white = r.standard_normal((H, W))
    fy = np.fft.fftfreq(H)[:, None]
    fx = np.fft.fftfreq(W)[None, :]
    f = np.sqrt(fx * fx + fy * fy)
    f[0, 0] = 1.0
    spec = np.fft.fft2(white) / (f ** beta)
    spec[0, 0] = 0
    n = np.real(np.fft.ifft2(spec))
    n -= n.min(); n /= n.max()
    return n

def lerp(a, b, t):
    return a + (b - a) * t[..., None]

def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)

turb = periodic_noise(2.3, 1) * 2 - 1       # Verwirbelung der Adern
turb2 = periodic_noise(2.0, 2) * 2 - 1
cloud = periodic_noise(2.2, 3)              # großflächige Farbwolken
fine = periodic_noise(0.6, 4) * 2 - 1       # feine Körnung

X = np.arange(W)[None, :] / W
Y = np.arange(H)[:, None] / H

# Hauptadern: ganzzahlige Zyklenzahl => in beide Richtungen nahtlos
s1 = 3 * X + 2 * Y + 1.1 * turb
vein1 = (1 - np.abs(np.sin(np.pi * s1 * 2 / 2 * 2))) ** 9
# Nebenadern in anderer Richtung, feiner
s2 = 5 * X - 4 * Y + 0.6 * turb2
vein2 = (1 - np.abs(np.sin(np.pi * s2 * 2))) ** 20

navy = np.array([0.015, 0.06, 0.20])
blue = np.array([0.03, 0.27, 0.52])
turq = np.array([0.10, 0.78, 0.76])
pale = np.array([0.90, 1.00, 0.98])

base = np.empty((H, W, 3))
t = smooth(0.25, 0.75, cloud)
base[:] = navy
base = lerp(np.broadcast_to(navy, (H, W, 3)), np.broadcast_to(blue, (H, W, 3)), smooth(0.15, 0.55, cloud))
base = lerp(base, np.broadcast_to(turq, (H, W, 3)), smooth(0.5, 0.85, cloud) * 0.9)

img = lerp(base, np.broadcast_to(pale, (H, W, 3)), vein1 * 0.85)
img = lerp(img, np.broadcast_to(pale, (H, W, 3)), vein2 * 0.35)
img = img * (0.95 + 0.05 * fine[..., None])
img = np.clip(img, 0, 1) ** (1 / 1.05)

Image.fromarray((img * 255).astype(np.uint8)).save("textures/marmor_tuerkis.jpg", quality=90, optimize=True)
print("fertig")
