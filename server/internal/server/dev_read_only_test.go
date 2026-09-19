package server

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

// TestDevReadOnlyRejectsMutation prevents a LAN design preview from changing
// the personal database through settings, import, or sync endpoints.
func TestDevReadOnlyRejectsMutation(t *testing.T) {
	s := &Server{devReadOnly: true}
	called := false
	handler := s.devReadOnlyMiddleware()(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		called = true
	}))
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, "/api/v1/import", nil))
	if recorder.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusForbidden)
	}
	if called {
		t.Fatal("mutation reached the wrapped handler")
	}
}

// TestDevReadOnlyAllowsReads protects the preview's intended data-viewing path
// while mutation methods remain forbidden.
func TestDevReadOnlyAllowsReads(t *testing.T) {
	s := &Server{devReadOnly: true}
	called := false
	handler := s.devReadOnlyMiddleware()(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		called = true
	}))
	handler.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/api/v1/me", nil))
	if !called {
		t.Fatal("GET did not reach the wrapped handler")
	}
}
