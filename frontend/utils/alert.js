import Swal from "sweetalert2";
import "sweetalert2/dist/sweetalert2.min.css";

export const AlertSuccess = (text) => {
  Swal.fire({
    title: "Berhasil!",
    text,
    icon: "success",
    timer: 1800,
    showConfirmButton: false,
    background: "#ffffff",
    color: "#374151",
    iconColor: "#10b981",
    backdrop: `
      rgba(0,0,0,0.4)
      left top
      no-repeat
    `,
  });
};

export const AlertError = (text) => {
  Swal.fire({
    title: "Gagal!",
    text,
    icon: "error",
    confirmButtonText: "Mengerti",
    confirmButtonColor: "#ef4444",
    background: "#ffffff",
    color: "#374151",
    iconColor: "#ef4444",
    backdrop: `
      rgba(0,0,0,0.45)
    `,
  });
};

export const AlertWarning = (text) => {
  Swal.fire({
    title: "Perhatian",
    text,
    icon: "warning",
    confirmButtonText: "OK",
    confirmButtonColor: "#f59e0b",
    background: "#ffffff",
    color: "#374151",
    iconColor: "#f59e0b",
  });
};

export const AlertLoading = (text = "Harap tunggu...") => {
  Swal.fire({
    title: text,
    allowOutsideClick: false,
    allowEscapeKey: false,
    didOpen: () => {
      Swal.showLoading();
    },
    background: "#ffffff",
    color: "#374151",
  });
};

export const AlertConfirm = async (text, confirmText = "Ya, lanjutkan") => {
  const result = await Swal.fire({
    title: "Konfirmasi",
    text,
    icon: "question",
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: "Batal",
    confirmButtonColor: "#6366f1",
    cancelButtonColor: "#94a3b8",
    background: "#ffffff",
    color: "#374151",
    iconColor: "#6366f1",
  });
  return result.isConfirmed;
};
