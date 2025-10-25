// Copyright 2025 Lohann Paterno Coutinho Ferreira <developer@lohann.dev>
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import React from "react";
import usePure from "./usePure.ts";
import useLazyOnce from "./useLazyOnce.ts";
import useInitOnce from "./useInitOnce.ts";

React.usePure = usePure;
React.useLazyOnce = useLazyOnce;
React.useInitOnce = useInitOnce;
