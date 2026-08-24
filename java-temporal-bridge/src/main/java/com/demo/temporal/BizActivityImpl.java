package com.demo.temporal;

import java.util.Map;

public class BizActivityImpl implements BizActivity {

    @Override
    public void submitApplication(Map<String, Object> input) {
        System.out.println("[Activity] submitApplication input=" + input);
    }

    @Override
    public void notifyPass(Map<String, Object> input) {
        System.out.println("[Activity] notifyPass input=" + input);
    }

    @Override
    public void notifyReject(Map<String, Object> input) {
        System.out.println("[Activity] notifyReject input=" + input);
    }
}
